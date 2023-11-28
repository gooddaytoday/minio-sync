module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'node', 'prettier'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  rules: {
    'prettier/prettier': 'warn',
    'node/no-missing-import': 'off',
    'node/no-empty-function': 'off',
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-require': 'off',
    'node/shebang': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    quotes: ['warn', 'double', { avoidEscape: true }],
    'node/no-unpublished-import': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/restrict-template-expressions": [
      "warn",
      {
        "allowBoolean": true,
        "allowNumber": true
      }
    ],
    "@typescript-eslint/no-inferrable-types": [
      "warn",
      {
        "ignoreParameters": true,
        "ignoreProperties": true
      }
    ],
    "no-sparse-arrays": [
      "warn"
    ],
    "no-useless-escape": [
      "warn"
    ],
    "no-nested-ternary": "error",
    "no-trailing-spaces": "error",
    "no-magic-numbers": "off",
    "@typescript-eslint/no-magic-numbers": [
      "warn",
      {
        "ignoreDefaultValues": true,
        "ignoreArrayIndexes": true,
        "ignoreNumericLiteralTypes": true,
        "ignoreEnums": true,
        "ignore": [
          1,
          0
        ]
      }
    ],
    "default-case": "warn",
    "default-case-last": "warn",
    "prefer-const": "error",
    "@typescript-eslint/naming-convention": [
      "warn",
      // ? https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/naming-convention.md
      {
        "selector": [
          "interface"
        ],
        "prefix": [
          "I"
        ],
        "format": [
          "PascalCase"
        ]
      },
      {
        "selector": [
          "typeAlias"
        ],
        "prefix": [
          "T"
        ],
        "format": [
          "PascalCase"
        ]
      },
      {
        "selector": [
          "default"
        ],
        "format": [
          "PascalCase",
          "camelCase"
        ]
      },
      {
        "selector": [
          "variableLike",
          "memberLike",
          "property"
        ],
        "format": [
          "PascalCase",
          "camelCase"
        ]
      }
    ],
  },
};
