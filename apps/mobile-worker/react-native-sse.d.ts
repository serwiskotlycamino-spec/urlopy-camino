declare module 'react-native-sse' {
  type EventSourceOptions = {
    pollingInterval?: number;
    timeout?: number;
    headers?: Record<string, string>;
  };

  type EventSourceListener = (event: {
    type: string;
    data?: string;
    message?: string;
  }) => void;

  export default class EventSource {
    constructor(url: string, options?: EventSourceOptions);
    addEventListener(type: string, listener: EventSourceListener): void;
    close(): void;
  }
}
