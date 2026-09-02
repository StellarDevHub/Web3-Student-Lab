module.exports = {
  presets: [
    ['@babel/preset-env', { modules: 'commonjs' }],
    ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
  ],
};
