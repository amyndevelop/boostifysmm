/** Codes are safe for logs; remote bodies and exception messages are not. */
export class PaymentProcessingError extends Error {
 constructor(readonly code:string,readonly retryable:boolean,message:string){super(message);}
}
