import { createEvaluationInterceptor } from './evaluation-interceptor';
import { demoAccountPassword } from '../mocks/credentials';

export const evaluationAvailable =
  globalThis.location?.origin === 'https://tch-healthcare-demo.pages.dev';
export const hostedDemoPassword = evaluationAvailable ? demoAccountPassword : null;
export const evaluationInterceptor = createEvaluationInterceptor(evaluationAvailable);
