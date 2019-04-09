const API = require('./Api');

module.exports = function (options) {
  const userAgent = Object.prototype.hasOwnProperty.call(options, 'user_agent')
    ? options.user_agent
    : 'pokello';
  const modifiedOptions = Object.assign({}, options, { userAgent });

  const api = API(modifiedOptions);
  return { api };
};
