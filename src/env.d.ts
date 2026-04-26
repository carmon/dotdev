declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAIL_TO?: string;
      LINKEDIN_PROFILE?: string;
      GITHUB_PROFILE?: string;
      X_PROFILE?: string;
      VERCEL_GIT_COMMIT_SHA?: string;
      VERCEL_GIT_COMMIT_TIMESTAMP?: string;
    }
  }
}

export {};
