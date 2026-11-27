import { createEvaluationInterceptor } from './evaluation-interceptor';

export const evaluationAvailable = ['localhost', '127.0.0.1', '[::1]'].includes(
  globalThis.location?.hostname,
);
export const hostedDemoPassword: string | null = null;
export const evaluationInterceptor = createEvaluationInterceptor(evaluationAvailable);
