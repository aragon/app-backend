export class MockWebSocket {
  public onopen: any = null
  public onmessage: any = null
  public onerror: any = null
  public onclose: any = null

  addEventListener(event: string, callback: any) {
    if (event === 'open') this.onopen = callback
    if (event === 'message') this.onmessage = callback
    if (event === 'error') this.onerror = callback
    if (event === 'close') this.onclose = callback
  }

  removeEventListener(event: string, callback: any) {
    if (event === 'open' && this.onopen === callback) this.onopen = null
    if (event === 'message' && this.onmessage === callback) this.onmessage = null
    if (event === 'error' && this.onerror === callback) this.onerror = null
    if (event === 'close' && this.onclose === callback) this.onclose = null
  }

  send(payload: any) {
    // mock send
  }

  close(code?: number, reason?: string) {
    // mock close
  }

  get readyState() {
    return 1 // OPEN
  }
}
