import { settleNetgraphLayout, type NetgraphLayoutRequest } from "./netgraph-layout";

self.onmessage = (event: MessageEvent<NetgraphLayoutRequest>) => {
  const result = settleNetgraphLayout(event.data);
  self.postMessage(result);
};
