// devnotes
//  01 : retry on wait
//      - if set to true, any call that errors out with 'you are doing this too much, try again in:
//        x seconds' code will automatically timeout the program until the wait time has finished,
//        retrying once more after timout.
//  02 : retry on reddit server error
//      - if set to true, then the program will retry any call that fails due to a reddit server
//        error. You can also specify the retry wait duration in seconds.
//  03 : logs
//      - if set to true, will display logs (default is true).

const request = require('request');
const Promise = require('bluebird');

const CONSTANTS = {
  urlAccessToken: 'https://www.reddit.com/api/v1/access_token',
  urlStandardReddit: 'https://oauth.reddit.com',
};

module.exports = function (options) {
  class API {
    constructor(options) { // eslint-disable-line no-shadow
      this.tokenExpiration = 0;
      this.token = null;
      this.username = options.username;
      this.password = options.password;
      this.appID = options.appID;
      this.apiSecret = options.apiSecret;
      this.userAgent = options.userAgent;
      this.retryOnWait = (options.retryOnWait) // see devnote 01
        ? options.retryOnWait
        : false;
      this.retryOnServerError = (options.retryOnServerError) // see devnote 02
        ? options.retryOnServerError
        : 0;
      this.retryDelay = (options.retryDelay)
        ? options.retryDelay
        : 5;
      this.logs = (options.logs)
        ? options.logs
        : true;
    }


    logHelper(str) {
      if (this.logs) console.log(str); // eslint-disable-line no-console
    }


    parseBodyHelper(bodyJSON) {
      const self = this;
      let body;

      if (typeof bodyJSON === 'string') {
        try {
          body = JSON.parse(bodyJSON);
        } catch (e) {
          self.logHelper(`Error parsing JSON body: ${e} just returning body.`);
          body = bodyJSON;
        }
      } else {
        body = bodyJSON;
      }
      return body;
    }


    getToken() {
      this.getTokenHelper(true);
    }


    getTokenServerErrorLooper() {
      /* eslint-disable arrow-body-style */
      const self = this;

      return new Promise((superResolve, superReject) => {
        return Promise.mapSeries(new Array(self.retryOnServerError + 1), () => {
          return new Promise((res1, rej1) => { // eslint-disable-line no-unused-vars
            self.getTokenHelper(false)
              .then((result) => {
                if (result !== undefined) return superResolve(result);
                return setTimeout(() => {
                  return res1();
                }, self.retryDelay * 1000);
              })
              .catch(err => superReject(err));
          });
        });
      });
    }

    /* eslint-disable */
    // getTokenHelper(handleErrors) {
    //   const self = this;
    //
    //   if (Date.now() / 1000 <= self.tokenExpiration) {
    //     return Promise.resolve(self.token);
    //   }
    //
    //   return new Promise((resolve, reject) => {
    //     /* eslint-disable */
    //     request.post(
    //       {
    //         url: CONSTANTS.urlAccessToken,
    //         form: {
    //           "grant_type": "password",
    //           "username": self.username,
    //           "password": self.password
    //         },
    //         auth: {
    //           "user": self.app_id,
    //           "pass": self.api_secret
    //         },
    //         headers: {
    //           "User-Agent": self.user_agent
    //         }
    //       },
    //       /* eslint-enable */
    //       (err, res, body) => {
    //         if (err) return reject(new Error(`Error getting token: ${err}`));
    //         const statusClass = Math.floor(res.statusCode / 100); // the status
    //
    //         switch (statusClass) {
    //           case 2: {
    //             const tokenInfo = self.parseBodyHelper(body);
    //             self.tokenExpiration = (Date.now() / 1000) + (tokenInfo.expires_in / 2);
    //             self.token = `${tokenInfo.token_type} ${tokenInfo.access_token}`;
    //
    //             if (tokenInfo.token_type === undefined || tokenInfo.access_token === undefined) {
    //               self.logHelper(
    //                 `token retrieved is undefined. can get token for username: ${self.username}`,
    //               );
    //             }
    //             return resolve(self.token);
    //           }
    //           case 4: {
    //             self.logHelper(
    //               `getting token has resulted in: ${res.statusCode} here. This can originate from
    //               not giving this user access in your Reddit App Preferences. Cant obtain token.`,
    //             );
    //             return resolve(self.token);
    //           }
    //           case 5: {
    //             if (self.retryOnServerError > 0 && handleErrors) {
    //               self.logHelper(
    //                 `Received server error when trying to get token, attempting
    //                 ${self.retryOnServerError + 1} retries.`,
    //               );
    //               return self.getTokenServerErrorLooper()
    //                 .then((newToken) => {
    //                   self.token = newToken;
    //                   return resolve(self.token);
    //                 })
    //                 .catch(errr => reject(errr));
    //             }
    //             if (handleErrors) {
    //               self.logHelper(
    //                 `Getting token has resulted in: ${res.statusCode} here. Try enabling
    //                 retries on server errors to automatically retry on this error.`,
    //               );
    //             }
    //             return resolve(undefined);
    //           }
    //           default: {
    //             return resolve(self.token);
    //           }
    //         }
    //       },
    //     );
    //   });
    // }


    getTokenHelper(handleErrors) {
      let self = this;

      if (Date.now() / 1000 <= self.tokenExpiration) {
        return Promise.resolve(self.token);
      }

      return new Promise(function(resolve, reject) {
        request.post({
          url: CONSTANTS.urlAccessToken,
          form: {
            "grant_type": "password",
            "username": self.username,
            "password": self.password
          },
          auth: {
            "user": self.appID,
            "pass": self.apiSecret
          },
          headers: {
            "User-Agent": self.userAgent
          }
        }, (err, res, body) => {
          if (err) {
            return reject("Error getting token: " + err);
          }

          // The status
          let status_class = Math.floor(res.statusCode / 100);

          if (status_class == 2) { // 200 Level so **quickly** return.
            let token_info = self._parseBodyHelper(body);
            self.token_expiration = Date.now() / 1000 + token_info.expires_in / 2;
            self.token = token_info.token_type + " " + token_info.access_token;

            if (token_info.token_type == undefined || token_info.access_token == undefined) {
              self._logHelper("The token retrieved was undefined. The username which we couln't get a token for is: " + self.username);
            }

            return resolve(self.token);
          } else if (status_class == 4) { // Most likely a 403 here
            self._logHelper("Getting token has resulted in: " + res.statusCode + " here. This can originate from not giving this user access in your Reddit App Preferences. Can't obtain token.");
            return resolve(self.token);
          } else if (status_class == 5) { // 503 possibly, server error most likely. do some retries if specified.

            if (self.retry_on_server_error > 0 && handleErrors) {
              self._logHelper("Received server error when trying to get token, attempting " + (self.retry_on_server_error + 1) + " retries.");
              return self._get_token_server_error_looper()
                .then(function(newToken) {
                  self.token = newToken;
                  return resolve(self.token);
                })
                .catch(function(err) {
                  return reject(err);
                });
            } else {

              if (handleErrors) {
                self._logHelper("Getting token has resulted in: " + res.statusCode + " here. Try enabling retries on server errors to automatically retry on this error.");
              }

              return resolve(undefined);
            }
          } else {
            return resolve(self.token);
          }
        })
      });
    }
    /* eslint-enable */

    makeRequest(
      token,
      endpoint,
      method,
      data,
      waitingRetryCount,
      retryOnServerErrorEnabled,
      retryOn403,
    ) {
      const self = this;

      return new Promise((resolve, reject) => {
        /* eslint-disable */
        const requestOptions = {
          url: endpoint,
          method: method,
          headers: {
            'Authorization': token,
            'User-Agent': self.userAgent,
          }
        };
        /* eslint-enable */

        if (method === 'GET') {
          requestOptions.qs = data;
        } else if (method === 'POST') {
          requestOptions.form = data;
        } else if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
          requestOptions.body = data;
          requestOptions.json = true;
        } else {
          self.logHelper('no method provided for request.');
        }

        self.logHelper(`Making ${method} request to: ${endpoint}`);
        request(requestOptions, (err, res, bodyJSON) => {
          if (err) return reject(new Error(`Error making request: ${err}`));

          const body = self.parseBodyHelper(bodyJSON); // dont parse if already an object
          const statusClass = Math.floor(res.statusCode / 100);
          self.logHelper(`Have gotten a response with the following statusCode: ${res.statusCode}`);

          switch (statusClass) {
            case 1: { // Information
              return resolve([res.statusCode, body]);
            }
            case 2: { // Success
              if (body && body.json && body.json.ratelimit) {
                const retryingSec = body.json.ratelimit;

                if (retryingSec > 0 && self.retryOnWait && waitingRetryCount === 0) {
                  self.logHelper(
                    `Retrying [in ${retryingSec} seconds] making request due to ratelimit.`,
                  );
                  return setTimeout(() => self.makeRequest(
                    token,
                    endpoint,
                    method,
                    data,
                    waitingRetryCount + 1,
                    true,
                    true,
                  )
                    .then(results => resolve(results))
                    .catch(errr => reject(errr)), retryingSec * 1000);
                }
                return reject(
                  new Error(
                    `you are doing this too much, try again in: ${body.json.ratelimit} seconds`,
                  ),
                );
              }
              return resolve([res.statusCode, body]);
            }
            case 3: { // Redirection
              return resolve([res.statusCode, body]);
            }
            case 4: { // Client error
              // usually a 403 is the because your access token has expired,
              // get a new one token and retry.
              if (res.statusCode === 403 && retryOn403) {
                self.logHelper('Encountered 403, retrying after grabbing new token.');
                return self.getToken()
                  .then(tkn => self.makeRequest(
                    tkn,
                    endpoint,
                    method,
                    data,
                    waitingRetryCount,
                    retryOnServerErrorEnabled,
                    false,
                  )
                    .then(results => resolve(results))
                    .catch(errr => reject(errr)))
                  .catch(errr => reject(errr));
              }

              if (res.statusCode === 403) {
                return reject(new Error('Received two 403s in a row. Not retrying again.'));
              }

              return resolve([res.statusCode, body]);
            }
            case 5: { // Server Error
              if (self.retryOnServerError > 0 && retryOnServerErrorEnabled) {
                return self.makeRequestHelper(token, endpoint, method, data)
                  .then(results => resolve(results))
                  .catch(errr => reject(errr));
              }
              return reject(
                new Error(
                  `server error has occurred: ${res.statusCode} and body: ${body}`,
                ),
              );
            }
            default: {
              return reject(
                new Error(
                  `Should not have reached here. StatusCode: ${res.statusCode} and Body: ${body}`,
                ),
              );
            }
          }
        });
      });
    }


    makeRequestHelper(token, endpoint, method, data) {
      /* eslint-disable arrow-body-style */
      const self = this;

      return new Promise((superResolve, superReject) => {
        return Promise.mapSeries(new Array(self.retryOnServerError + 1), () => {
          return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
            self.makeRequest(token, endpoint, method, data, 0, false, true)
              .then(results => superResolve(results))
              .catch((err) => {
                const errSplit = err.toString().split('server error');
                if (errSplit.length >= 2) {
                  // Continue (aka try again)
                  return setTimeout(() => {
                    self.logHelper('Got Server Error. Retrying Request.');
                    return resolve();
                  }, self.retryDelay * 1000);
                }

                self.logHelper('This should not be reached! Please report a bug!');
                return resolve();
              });
          });
        })
        /* eslint-disable no-unused-vars */
          .then(results => superReject(new Error('Did not succeed after numerous attempts.')))
          .catch(err => superReject(err));
      });
    }


    methodHelper(endpoint, data, URL, METHOD) {
      const self = this;

      return new Promise((resolve, reject) => {
        self.getToken()
          .then(token => self.makeRequest(token, URL + endpoint, METHOD, data, 0, true, true))
          .then(results => resolve(results))
          .catch(err => reject(err));
      });
    }

    get(endpoint, data) {
      const URL = CONSTANTS.urlStandardReddit;
      return this.methodHelper(endpoint, data, URL, 'GET');
    }


    post(endpoint, data) {
      const URL = CONSTANTS.urlStandardReddit;
      return this.methodHelper(endpoint, data, URL, 'POST');
    }


    patch(endpoint, data) {
      const URL = CONSTANTS.urlStandardReddit;
      return this.methodHelper(endpoint, data, URL, 'PATCH');
    }


    put(endpoint, data) {
      const URL = CONSTANTS.urlStandardReddit;
      return this.methodHelper(endpoint, data, URL, 'PUT');
    }


    del(endpoint, data) {
      const URL = CONSTANTS.urlStandardReddit;
      return this.methodHelper(endpoint, data, URL, 'DELETE');
    }
  }

  return new API(options);
};
