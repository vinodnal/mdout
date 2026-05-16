// eslint.config.js — ESLint flat config (v9+)
"use strict";

const js  = require("@eslint/js");
const nPlugin = require("eslint-plugin-n");

module.exports = [
  js.configs.recommended,
  nPlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.js", "bin/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      // Node.js safety
      "n/no-process-exit": "off",           // CLI tools legitimately use process.exit
      "n/no-missing-require": "error",
      "n/no-unpublished-require": "off",    // devDeps used in build scripts only
      "n/prefer-global/process": "off",

      // Code quality
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",                  // Logger module is the abstraction; console is used intentionally
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "warn",
      "no-shadow": "warn",
      "curly": "off",

      // Security
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "projects/**",
      "**/*.test.js",
    ],
  },
];
