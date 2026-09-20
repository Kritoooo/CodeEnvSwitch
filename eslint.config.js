const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const js = require("@eslint/js");

module.exports = [
    {
        ignores: ["bin/**", "node_modules/**", "eslint.config.js"],
    },
    js.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tsparser,
            ecmaVersion: 2021,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                NodeJS: "readonly",
                require: "readonly",
                module: "writable",
                __dirname: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-undef": "off",
            // Error `cause` needs ES2022; this package targets ES2019.
            "preserve-caught-error": "off",
        },
    },
];
