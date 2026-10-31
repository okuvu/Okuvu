import { isCognitoConfigured } from '@/lib/cognito-config';
import { isGoogleConfigured } from '@/lib/google-config';
import SignInPanel from './SignInPanel';

// Rendered per request on purpose: the panel reflects the deployment's actual
// provider configuration, which is injected into the container at run time
// (portal.tf). Prerendering this page would bake in whatever the build
// environment happened to have — and the image is built without any
// COGNITO_*/GOOGLE_* value, so every production login page would claim to be
// unconfigured.
export const dynamic = 'force-dynamic';

export default function AuthPage() {
  return (
    <SignInPanel
      googleConfigured={isGoogleConfigured()}
      cognitoConfigured={isCognitoConfigured()}
    />
  );
}
