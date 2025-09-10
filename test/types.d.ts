declare global {
  namespace Chai {
    interface Assertion {
      rejectedWith(errorConstructor?: any, message?: string | RegExp): Promise<any>
      rejectedWith(message?: string | RegExp): Promise<any>
      rejected: Promise<any>
      fulfilled: Promise<any>
      eventually: PromisedAssertion
    }

    interface PromisedAssertion extends Assertion {
      become(expected: any): PromisedAssertion
      not: PromisedAssertion
    }
  }
}

export {}
