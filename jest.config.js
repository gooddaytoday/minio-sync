module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/types/**/*.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
      isolatedModules: true,
    }]
  },
};
