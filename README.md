# Simple Blockchain

### 개발 동기

가능한 한 간결하고 단순한 블록체인 구현해보며 블록체인 원리를 이해한다.

### 블록체인이란?

[위키피디아](<https://en.wikipedia.org/wiki/Blockchain_(database)>)에 따르면: 블록체인은 블록이라고 불리는 지속적으로 증가하는 기록 목록을 유지하는 분산 데이터베이스로, 변조와 수정으로부터 안전하게 보호됩니다.

### Simple Blockchain의 핵심 개념

더 자세한 핵심 개념 개요는 [Simple Blockchain]()를 확인해보세요.

- 노드 제어를 위한 HTTP 인터페이스
- 다른 노드와 통신하기 위한 웹소켓 사용 (P2P)
- P2P 통신에서 매우 간단한 "프로토콜"
- 노드에 데이터가 영구 저장되지 않음
- 작업 증명이나 지분 증명 없음: 경쟁 없이 블록체인에 블록을 추가할 수 있음

### 빠른 시작

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
