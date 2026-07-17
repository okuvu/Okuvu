export function checkProductionBypass(
  nodeEnv: string | undefined,
  bypassFlag: string | undefined,
): void {
  if (nodeEnv === 'production' && bypassFlag === 'true') {
    throw new Error(
      'LOCAL_DEV_BYPASS_AUTH is set to "true" in NODE_ENV=production. ' +
      'This would leave the entire API unprotected. Refusing to start.',
    );
  }

  if (nodeEnv === 'production' && process.env.LOAD_TEST_MODE === 'true') {
    throw new Error(
      'LOAD_TEST_MODE is set to "true" in NODE_ENV=production. ' +
      'This would expose an auth bypass. Refusing to start.',
    );
  }
}
