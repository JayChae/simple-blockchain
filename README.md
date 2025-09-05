# Simple Blockchain

블록체인 원리 학습을 위한 간결하고 단순한 블록체인

## 블록체인이란?

블록의 해시로 연결된 블록을 순차적으로 쌓아가는 분산형 데이터베이스.

### 블록

여러 거래(또는 기록)를 일정한 단위로 묶어 놓은 데이터 집합.
블록체인의 블록에는 자신의 해시값과 이전 블록의 해시값을 데이터로 가지고 있다.

```ts
interface Block {
  previousHash: string; // 이전 블록의 해시 값
  index: number; // 인덱스
  timestamp: number; // 생성 시간
  data: string; // 담고 싶은 데이터
  hash: string; // 해당 블록의 해시값
}
```

#### 제네시스 블록

블록체인에 첫번째로 생성된 블록을 제네시스 블록이라고 한다.
하드 코딩으로 생성한다.

### 해시

데이터를 일정한 길이의 고정된 문자열로 변환하는 암호학적 함수.

- 같은 입력은 항상 같은 출력
- 입력값이 조금만 달라져도 출력값도 완전히 달라짐
- 출력값으로 입력값을 알아낼 수 없음.(단방향성)

```ts

calculateHash(
    index: number,
    previousHash: string,
    timestamp: number,
    data: string
): string => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
}

```

```ts
interface Block {
  previousHash: string;
  index: number;
  timestamp: number;
  data: string;
  // calculateHash(index,previousHash,timestamp,data)
  hash: string;
}
```

### 체인

각 블록이 이전 블록의 해시값을 포함하고 있기 때문에, 마치 **사슬(체인)**처럼 끊어지지 않고 연결된다.

### 분산형 데이터베이스

한 곳(서버)에만 데이터를 저장하지 않고, 여러 위치(노드, 서버)에 분산해서 저장·관리하는 데이터베이스.

## 블록 체인 Flow


### 1. node 3개인 상황



## 블록체인 핵심 기능 구현

```ts
class BlockchainNode {
  // 블록체인 배열
  private blockchain: Block[] = [this.getGenesisBlock()];
  // 연결된 노드(웹소켓 사용)
  private sockets: WebSocket[] = [];
}
```

### 웹소켓

```ts
initP2PServer(): void {
    const server = new WebSocket.Server({ port: P2P_PORT });

    // 다른 노드가 연결해 온 경우
    server.on("connection", (ws: WebSocket) => {
      console.log("connected", ws);
        // 연결된  노드에 추가
        this.sockets.push(ws);
        // 에러 및 메시지 받았을 경우 handler
        this.initMessageHandler(ws);
        this.initErrorHandler(ws);
        // 연결된 노드에게 최신 블록 정보 요청
        this.write(ws, this.queryChainLengthMsg());
    });
    console.log("listening websocket p2p port on: " + P2P_PORT);
}
```

### 제네시스 블록 하드 코딩

```ts
getGenesisBlock(): Block {
    return {
      index: 0,
      previousHash: "0",
      timestamp: 1756716811615,
      data: "Let there be a block",
      hash: "38cdd2a4bdf21856e32e440da4ade0441e5b327f87981fe18dc63c4e1f0a2db6",
    };
}
```

### 블록 생성

```ts
generateNextBlock(blockData: string): Block {
    const previousBlock = this.getLatestBlock(); // 기장 최신 블록 가져오기
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
```

### 전파하기

```ts
broadcast(message: Message): void {
    this.sockets.forEach((ws) => ws.send(JSON.stringify(message)));
}
```

### 전파받기

```ts
handleBlockchainResponse(message: Message): void {
  // 메시지에 데이터가 없으면 함수 종료
  if (!message.data) return;
  const receivedBlocks: Block[] = JSON.parse(message.data).sort(
    (b1: Block, b2: Block) => b1.index - b2.index
  );
  // 수신된 블록 중 가장 마지막 블록
  const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  // 현재 가지고 있는 블록체인의 가장 마지막 블록
  const latestBlockHeld = this.getLatestBlock();

  // 수신된 마지막 블록의 인덱스가 현재 블록의 마지막 블록 인덱스보다 클 경우 (체인이 더 길 경우: 노드가 뒤처졌을 가능성을 시사)
  if (latestBlockReceived.index > latestBlockHeld.index) {
    console.log(
      `blockchain possibly behind. We got: ${latestBlockHeld.index} Peer got: ${latestBlockReceived.index}`
    );
    // 현재 마지막 블록의 해시가 수신된 마지막 블록의 이전 해시와 일치하는 경우
    if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
      console.log("We can append the received block to our chain");
      // 수신된 블록을 현재 블록체인에 추가
      this.blockchain.push(latestBlockReceived);
      // 새로운 마지막 블록을 다른 피어들에게 전파
      this.broadcast(this.responseLatestMsg());
    } else if (receivedBlocks.length === 1) {
      // 수신된 블록이 하나뿐이고, 이전 해시가 일치하지 않는다면
      console.log("We have to query the chain from our peer");
      // 많이 뒤쳐져 있을 가능성 시사 체인 전체를 요청
      // 전체 체인 정보를 요청하는 메시지를 전파
      this.broadcast(this.queryAllMsg());
    } else {
      // 수신된 블록체인이 현재 블록체인보다 길고, 이전 해시가 일치하지 않는 경우
      console.log("Received blockchain is longer than current blockchain");
      // 수신된 블록체인으로 현재 블록체인을 교체
      this.replaceChain(receivedBlocks);
    }
  } else {
    // 수신된 블록체인이 현재 블록체인보다 길지 않은 경우
    console.log(
      "received blockchain is not longer than current blockchain. Do nothing"
    );
    // 아무 작업도 수행하지 않음
  }
}
```

### 유효한 블록인지 검사하기

```ts
isValidNewBlock(newBlock: Block, previousBlock: Block): boolean {
    // 인덱스 검사
    if (previousBlock.index + 1 !== newBlock.index) {
      console.log("invalid index");
      return false;
      // 이전 블록의 해시 검사
    } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log("invalid previoushash");
      return false;
      // 해시 검사
    } else if (this.calculateHashForBlock(newBlock) !== newBlock.hash) {
      console.log(
        `invalid hash: ${this.calculateHashForBlock(newBlock)} ${newBlock.hash}`
      );
      return false;
    }
    return true;
  }
```

### 가장 긴 체인 선택하기

```ts
replaceChain(newBlocks: Block[]): void {
    if (
      this.isValidChain(newBlocks) &&
      newBlocks.length > this.blockchain.length
    ) {
      console.log(
        "Received blockchain is valid. Replacing current blockchain with received blockchain"
      );
      this.blockchain = newBlocks;
      this.broadcast(this.responseLatestMsg());
      // 전파하기
    } else {
      console.log("Received blockchain invalid");
    }
}
```

### 노드 제어를 위한 HTTP 서버 설정

노드를 제어하기 위해서 HTTP 서버를 설정. 사용자는 이 서버를 통해 노드에 특정 명령을 내리거나 상태를 변경하는 등의 방식으로 노드를 제어할 수 있다.

```ts
initHttpServer(): void {
    const app = express();
    app.use(express.json());
    // 대쉬보드를 위한 정적 파일 제공
    app.use(express.static(path.join(__dirname, "..", "public")));

    // 블록체인 확인
    app.get("/blocks", (req, res) => {
      res.send(JSON.stringify(this.blockchain));
    });

    // 블록 만들기
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

    // 연결된 노드 확인하기

    app.get("/peers", (req, res) => {
      res.send(
        this.sockets.map(
          (s: any) => s._socket.remoteAddress + ":" + s._socket.remotePort
        )
      );
    });

    // 노드 연결하기
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
```



## 빠른 시작

(두 개의 연결된 노드를 설정하고 1개 블록 채굴)

```
npm install
HTTP_PORT=3001 P2P_PORT=6001 npm start
HTTP_PORT=3002 P2P_PORT=6002 PEERS=ws://localhost:6001 npm start
curl -H "Content-type:application/json" --data '{"data" : "첫 번째 블록의 데이터"}' http://localhost:3001/mineBlock
```

### Docker로 빠른 시작

(세 개의 연결된 노드를 설정하고 블록 채굴)

```sh
docker-compose up
curl -H "Content-type:application/json" --data '{"data" : "첫 번째 블록의 데이터"}' http://localhost:3001/mineBlock
```

### HTTP API

##### 블록체인 조회

```
curl http://localhost:3001/blocks
```

##### 블록 생성

```
curl -H "Content-type:application/json" --data '{"data" : "첫 번째 블록의 데이터"}' http://localhost:3001/mineBlock
```

##### 피어 추가

```
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6001"}' http://localhost:3001/addPeer
```

##### 연결된 피어 조회

```
curl http://localhost:3001/peers
```
