import { DefaultSession } from 'next-auth';
import type { HarnessRole, TestEnvironment } from '@okuvu/shared-types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: HarnessRole;
      environments: TestEnvironment[];
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: HarnessRole;
    environments?: TestEnvironment[];
  }
}
