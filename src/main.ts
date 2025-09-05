import * as CryptoJS from "crypto-js";
import express from "express";
import WebSocket from "ws";
import path from "path";
import {
  Block,
  MessageType,
  Message,
  MineBlockRequest,
  AddPeerRequest,
} from "./types";

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3001");
const P2P_PORT = parseInt(process.env.P2P_PORT || "6001");
const INITIAL_PEERS = process.env.PEERS ? process.env.PEERS.split(",") : [];

class BlockchainNode {
  private blockchain: Block[] = [this.getGenesisBlock()];
  private sockets: WebSocket[] = [];

  public connectToPeers(newPeers: string[]): void {
    newPeers.forEach((peer) => {
      const ws = new WebSocket(peer);
      ws.on("open", () => this.initConnection(ws));
      ws.on("error", () => {
        console.log("connection failed");
      });
    });
  }

  public initHttpServer(): void {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "..", "public")));

    app.get("/blocks", (req, res) => {
      res.send(JSON.stringify(this.blockchain));
    });

    app.post(
      "/mineBlock",
      (req: express.Request<{}, {}, MineBlockRequest>, res) => {
        const newBlock = this.generateNextBlock(req.body.data);
        this.addBlock(newBlock);
        this.broadcast(this.responseLatestMsg());
        console.log("block added: " + JSON.stringify(newBlock));
        res.send("success");
      }
    );

    app.get("/peers", (req, res) => {
      res.send(
        this.sockets.map(
          (s: any) => s._socket.remoteAddress + ":" + s._socket.remotePort
        )
      );
    });

    app.post(
      "/addPeer",
      (req: express.Request<{}, {}, AddPeerRequest>, res) => {
        this.connectToPeers([req.body.peer]);
        res.send("success");
      }
    );

    app.listen(HTTP_PORT, () => {
      console.log("Listening http on port: " + HTTP_PORT);
    });
  }

  public initP2PServer(): void {
    const server = new WebSocket.Server({ port: P2P_PORT });
    server.on("connection", (ws: WebSocket) => {
      console.log("connected", ws);
      this.initConnection(ws);
    });
    console.log("listening websocket p2p port on: " + P2P_PORT);
  }

  private getGenesisBlock(): Block {
    return {
      index: 0,
      previousHash: "0",
      timestamp: 1756716811615,
      data: "Let there be a block",
      hash: "38cdd2a4bdf21856e32e440da4ade0441e5b327f87981fe18dc63c4e1f0a2db6",
    };
  }

  private initConnection(ws: WebSocket): void {
    this.sockets.push(ws);
    this.initMessageHandler(ws);
    this.initErrorHandler(ws);
    this.write(ws, this.queryChainLengthMsg());
  }

  private initMessageHandler(ws: WebSocket): void {
    ws.on("message", (data: WebSocket.Data) => {
      const message: Message = JSON.parse(data.toString());
      console.log("Received message" + JSON.stringify(message));

      switch (message.type) {
        case MessageType.QUERY_LATEST:
          this.write(ws, this.responseLatestMsg());
          break;
        case MessageType.QUERY_ALL:
          this.write(ws, this.responseChainMsg());
          break;
        case MessageType.RESPONSE_BLOCKCHAIN:
          this.handleBlockchainResponse(message);
          break;
      }
    });
  }

  private initErrorHandler(ws: WebSocket): void {
    const closeConnection = (ws: WebSocket) => {
      console.log("connection failed to peer: " + (ws as any).url);
      this.sockets.splice(this.sockets.indexOf(ws), 1);
    };
    ws.on("close", () => closeConnection(ws));
    ws.on("error", () => closeConnection(ws));
  }

  private generateNextBlock(blockData: string): Block {
    const previousBlock = this.getLatestBlock();
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = Date.now();
    const nextHash = this.calculateHash(
      nextIndex,
      previousBlock.hash,
      nextTimestamp,
      blockData
    );

    return {
      index: nextIndex,
      previousHash: previousBlock.hash,
      timestamp: nextTimestamp,
      data: blockData,
      hash: nextHash,
    };
  }

  private calculateHashForBlock(block: Block): string {
    return this.calculateHash(
      block.index,
      block.previousHash,
      block.timestamp,
      block.data
    );
  }

  private calculateHash(
    index: number,
    previousHash: string,
    timestamp: number,
    data: string
  ): string {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
  }

  private addBlock(newBlock: Block): void {
    if (this.isValidNewBlock(newBlock, this.getLatestBlock())) {
      this.blockchain.push(newBlock);
    }
  }

  private isValidNewBlock(newBlock: Block, previousBlock: Block): boolean {
    if (previousBlock.index + 1 !== newBlock.index) {
      console.log("invalid index");
      return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log("invalid previoushash");
      return false;
    } else if (this.calculateHashForBlock(newBlock) !== newBlock.hash) {
      console.log(
        `invalid hash: ${this.calculateHashForBlock(newBlock)} ${newBlock.hash}`
      );
      return false;
    }
    return true;
  }

  private handleBlockchainResponse(message: Message): void {
    if (!message.data) return;

    const receivedBlocks: Block[] = JSON.parse(message.data).sort(
      (b1: Block, b2: Block) => b1.index - b2.index
    );
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    const latestBlockHeld = this.getLatestBlock();

    if (latestBlockReceived.index > latestBlockHeld.index) {
      console.log(
        `blockchain possibly behind. We got: ${latestBlockHeld.index} Peer got: ${latestBlockReceived.index}`
      );
      if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
        console.log("We can append the received block to our chain");
        this.blockchain.push(latestBlockReceived);
        this.broadcast(this.responseLatestMsg());
      } else if (receivedBlocks.length === 1) {
        console.log("We have to query the chain from our peer");
        this.broadcast(this.queryAllMsg());
      } else {
        console.log("Received blockchain is longer than current blockchain");
        this.replaceChain(receivedBlocks);
      }
    } else {
      console.log(
        "received blockchain is not longer than current blockchain. Do nothing"
      );
    }
  }

  private replaceChain(newBlocks: Block[]): void {
    if (
      this.isValidChain(newBlocks) &&
      newBlocks.length > this.blockchain.length
    ) {
      console.log(
        "Received blockchain is valid. Replacing current blockchain with received blockchain"
      );
      this.blockchain = newBlocks;
      this.broadcast(this.responseLatestMsg());
    } else {
      console.log("Received blockchain invalid");
    }
  }

  private isValidChain(blockchainToValidate: Block[]): boolean {
    if (
      JSON.stringify(blockchainToValidate[0]) !==
      JSON.stringify(this.getGenesisBlock())
    ) {
      return false;
    }

    const tempBlocks = [blockchainToValidate[0]];
    for (let i = 1; i < blockchainToValidate.length; i++) {
      if (this.isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
        tempBlocks.push(blockchainToValidate[i]);
      } else {
        return false;
      }
    }
    return true;
  }

  private getLatestBlock(): Block {
    return this.blockchain[this.blockchain.length - 1];
  }

  private queryChainLengthMsg(): Message {
    return { type: MessageType.QUERY_LATEST };
  }

  private queryAllMsg(): Message {
    return { type: MessageType.QUERY_ALL };
  }

  private responseChainMsg(): Message {
    return {
      type: MessageType.RESPONSE_BLOCKCHAIN,
      data: JSON.stringify(this.blockchain),
    };
  }

  private responseLatestMsg(): Message {
    return {
      type: MessageType.RESPONSE_BLOCKCHAIN,
      data: JSON.stringify([this.getLatestBlock()]),
    };
  }

  private write(ws: WebSocket, message: Message): void {
    ws.send(JSON.stringify(message));
  }

  private broadcast(message: Message): void {
    this.sockets.forEach((socket) => this.write(socket, message));
  }
}

// 애플리케이션 시작
const node = new BlockchainNode();
node.initHttpServer();
node.initP2PServer();
node.connectToPeers(INITIAL_PEERS);
