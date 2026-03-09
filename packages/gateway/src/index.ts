import type { Context, MiddlewareHandler } from 'hono';

export {
  InMemorySpentTxStore,
  createBasePublicClient,
  getBaseChainFromEnv,
  verifyUsdcPayment,
  type PaymentVerificationFailure,
  type PaymentVerificationResult,
  type PaymentVerificationSuccess,
  type PaymentVerifierClient,
  type SpentTxStore,
  type VerifyUsdcPaymentInput,
  type VerifyUsdcPaymentOptions,
} from './verifier.js';

const DEFAULT_PAYMENT_HEADER = 'x-payment-tx';
const DEFAULT_REQUEST_ID_HEADER = 'x-request-id';

export interface PayrailGatewayVerifyInput {
  txHash: string;
  requestId: string;
  method: string;
  path: string;
}

export interface PayrailGatewayVerifySuccess {
  allowed: true;
  txHash: string;
  details?: Record<string, unknown>;
}

export interface PayrailGatewayVerifyFailure {
  allowed: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type PayrailGatewayVerifyResult = PayrailGatewayVerifySuccess | PayrailGatewayVerifyFailure;

export interface PayrailGatewayMeterInput {
  txHash: string;
  requestId: string;
  method: string;
  path: string;
  verification: PayrailGatewayVerifySuccess;
}

export type PayrailPaymentVerifier = (
  params: PayrailGatewayVerifyInput,
) => Promise<PayrailGatewayVerifyResult> | PayrailGatewayVerifyResult;

export type PayrailRequestMeter = (
  params: PayrailGatewayMeterInput,
) => Promise<void> | void;

export interface PayrailGatewayOptions {
  verifyPayment?: PayrailPaymentVerifier;
  meterRequest?: PayrailRequestMeter;
  paymentHeaderName?: string;
  requestIdHeaderName?: string;
}

function paymentRequiredResponse(
  c: Context,
  params: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  },
): Response {
  return c.json(
    {
      error: 'PAYMENT_REQUIRED',
      code: params.code,
      message: params.message,
      details: params.details,
    },
    402,
  );
}

function defaultRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const defaultVerifier: PayrailPaymentVerifier = () => {
  return {
    allowed: false,
    code: 'PAYMENT_VERIFIER_NOT_CONFIGURED',
    message: 'No payment verifier configured. Provide options.verifyPayment.',
  };
};

const defaultMeterRequest: PayrailRequestMeter = () => {
  return;
};

export function payrailGateway(options: PayrailGatewayOptions = {}): MiddlewareHandler {
  const verifyPayment = options.verifyPayment ?? defaultVerifier;
  const meterRequest = options.meterRequest ?? defaultMeterRequest;
  const paymentHeaderName = options.paymentHeaderName ?? DEFAULT_PAYMENT_HEADER;
  const requestIdHeaderName = options.requestIdHeaderName ?? DEFAULT_REQUEST_ID_HEADER;

  return async (c, next) => {
    const txHash = c.req.header(paymentHeaderName);
    if (!txHash) {
      return paymentRequiredResponse(c, {
        code: 'MISSING_PAYMENT_HEADER',
        message: `Missing required payment header: ${paymentHeaderName}`,
      });
    }

    const requestId = c.req.header(requestIdHeaderName) ?? defaultRequestId();
    const method = c.req.method;
    const path = c.req.path;

    let verification: PayrailGatewayVerifyResult;
    try {
      verification = await verifyPayment({
        txHash,
        requestId,
        method,
        path,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected payment verifier error.';

      return c.json(
        {
          error: 'PAYMENT_VERIFICATION_ERROR',
          message,
        },
        500,
      );
    }

    if (!verification.allowed) {
      return paymentRequiredResponse(c, verification);
    }

    try {
      await meterRequest({
        txHash,
        requestId,
        method,
        path,
        verification,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected metering error.';

      return c.json(
        {
          error: 'METERING_ERROR',
          message,
        },
        500,
      );
    }

    await next();
  };
}
