import { createEvaluationInterceptor } from './evaluation-interceptor';

export const evaluationAvailable =
  globalThis.location?.origin === 'https://tch-healthcare-demo.pages.dev';
export const hostedDemoPassword = evaluationAvailable ? 'TrueCare-Local-2026' : null;
export const evaluationInterceptor = createEvaluationInterceptor(evaluationAvailable);
