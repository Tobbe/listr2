/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [ '../.eslintrc.cjs' ],
  rules: {
    '@typescript-eslint/no-empty-interface': 'off',
    'import/no-extraneous-dependencies': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/naming-convention': 'off'
  }
}
