export interface Block {
  index: number;
  previousHash: string;
  timestamp: number;
  data: string;
  hash: string;
}

export enum MessageType {
  QUERY_LATEST = 0,
  QUERY_ALL = 1,
  RESPONSE_BLOCKCHAIN = 2,
}

export interface Message {
  type: MessageType;
  data?: string;
}

export interface MineBlockRequest {
  data: string;
}

export interface AddPeerRequest {
  peer: string;
}
