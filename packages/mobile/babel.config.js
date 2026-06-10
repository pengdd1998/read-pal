module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
    ],
    plugins: [
      require('./babel-plugin-wrap-define-property'),
    ],
  };
};
