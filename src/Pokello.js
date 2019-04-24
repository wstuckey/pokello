// *************************************************************************************************
// file    : Pokello.js
// author  : william h stuckey
// date    : 2019-03-25
// purpose : a simple javascript wrapper for the reddit api
// license : GPL-3.0
// *************************************************************************************************

// IMPORTS
const request = require('request');
const Promise = require('bluebird');

// CONSTANTS
const ACCESS_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REGULAR_REDDIT_URL = 'https://oauth.reddit.com';

// EXPORTS
module.exports = class Pokello {
    constructor(options) {
        this.token_expiration = 0;
        this.token = null;
        this.username = options.username;
        this.password = options.password;
        this.appID = options.appID;
        this.apiSecret = options.apiSecret;
        this.userAgent = options.userAgent;
        this.retryOnWait = options.retryOnWait;
        this.retryOnServerError = options.retryOnServerError; // default this to 0 seconds
        this.retryDelay = options.retryDelay; // default this to 5 seconds
        this.logs = options.logs;
    }

    _logger(str) {
        if (this.logs) {
            console.log(str);
        }
    }

    _parseBodyHelper(body_json) {
        let self = this,
            body;
        if (typeof body_json === 'string') {
            try {
                body = JSON.parse(body_json);
            } catch (e) {
                self._logger('Error parsing JSON body: ' + e + ' just returning body.');
                body = body_json;
            }
        } else {
            body = body_json;
        }
        return body;
    }

    get_token() {
        return this._get_token_helper(true);
    }

    _get_token_server_error_looper() {
        let self = this;
        return new Promise((super_resolve, super_reject) => {
            return Promise.mapSeries(new Array(self.retryOnServerError + 1), () => {
                // eslint-disable-next-line no-unused-vars
                return new Promise((res, rej) => {
                    self._get_token_helper(false)
                        .then((result) => {
                            if (result !== undefined) {
                                return super_resolve(result);
                            } else {
                                return setTimeout(() => {
                                    return res();
                                }, self.retryDelay * 1000);
                            }
                        })
                        .catch((err) => {
                            return super_reject(err);
                        });
                });
            });
        });
    }

    _get_token_helper(handleErrors) {
        let self = this;
        if ((Date.now() / 1000) <= self.token_expiration) {
            return Promise.resolve(self.token);
        }
        return new Promise((resolve, reject) => {
            request.post({
                url: ACCESS_TOKEN_URL,
                form: {
                    'grant_type': 'password',
                    'username': self.username,
                    'password': self.password
                },
                auth: {
                    'username': self.appID,
                    'password': self.apiSecret
                },
                headers: {
                    'User-Agent': self.userAgent
                }
            }, (err, res, body) => {
                if (err) {
                    return reject('ERROR: issue with token retrieval.' + err);
                }
                let statusClass = Math.floor(res.statusCode / 100);

                /* eslint-disable */
                switch (statusClass) {
                    case 2: {
                        let tokenInfo = self._parseBodyHelper(body);
                        self.token_expiration = Date.now() / 1000 + tokenInfo.expires_in / 2;
                        self.token = tokenInfo.token_type + ' ' + tokenInfo.access_token;
                        if (tokenInfo.token_type === undefined || tokenInfo.access_token === undefined) {
                            self._logger( 'ERROR: token for ' + self.username + 'is undefined');
                        }
                        return resolve(self.token);
                    }
                    case 4: {
                        self._logger(
                            'ERROR: token retrival resulted in: ' +
                            res.statusCode +
                            '. see reddit app preferences for more information.'
                        );
                        return resolve(self.token);
                    }
                    case 5: {
                        if (self.retryOnServerError > 0 && handleErrors) {
                            self._logger(
                                'ERROR: taken retrieval resulted in: ' +
                                res.statusCode +
                                '. attempting ' + (self.retryOnServerError + 1) + ' retries.');
                            return self._get_token_server_error_looper()
                                .then((newToken) => {
                                    self.token = newToken;
                                    return resolve(self.token);
                                })
                                .catch((err) => {
                                    return reject(err);
                                });
                        } else {
                            if (handleErrors) {
                                self._logger(
                                    'ERROR: taken retrieval resulted in: ' +
                                    res.statusCode +
                                    'enable server retries to automatically retry on this error.');
                            }
                            return resolve(undefined);
                        }
                    }
                    default: {
                        return resolve(self.token);
                    }
                }
                /* eslint-enable */
            });
        });
    }

    // TODO : clean up _make_request() method
    _make_request(token, endpoint, method, data, waitingRetryCount, retryOnServerErrorEnabled, retryOn403) {
        let self = this;
        return new Promise((resolve, reject) => {
            let request_options = {
                url: endpoint,
                method: method,
                headers: {
                    'Authorization': token,
                    'User-Agent': self.userAgent
                }
            };

            if (method === 'GET') {
                request_options.qs = data;
            } else if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
                request_options.body = data;
                request_options.json = true;
            } else if (method === 'POST') {
                request_options.form = data;
            }

            self._logger('Making ' + method + ' request to: ' + endpoint);
            request(request_options, (err, res, body_json) => {
                if (err) {
                    return reject('Error making request: ' + err);
                }
                let body = self._parseBodyHelper(body_json); // dont parse if its already an object
                let statusClass = Math.floor(res.statusCode / 100);
                self._logger('Have gotten a response with the following statusCode: ' + res.statusCode);
                /* eslint-disable */
                switch (statusClass) {
                    case 1: { // Information
                        return resolve([res.statusCode, body]);
                    }
                    case 2: { // Success
                        if (body && body.json && body.json.ratelimit) {
                            let retryingSec = body.json.ratelimit;
                            if (retryingSec > 0 && self.retryOnWait && waitingRetryCount === 0) {
                                self._logger('Retrying [in ' + retryingSec + ' seconds] making request due to ratelimit.');
                                return setTimeout(() => {
                                    // Retry this now that the wait is complete.
                                    return self._make_request(token, endpoint, method, data, waitingRetryCount + 1, true, true)
                                        .then((results) => {
                                            return resolve(results);
                                        })
                                        .catch((err) => {
                                            return reject(err);
                                        });
                                }, retryingSec * 1000);

                            } else {
                                return reject('you are doing this too much, try again in: ' + body.json.ratelimit + ' seconds');
                            }
                        } else {
                            return resolve([res.statusCode, body]);
                        }
                    }
                    case 3: { // Redirection
                        return resolve([res.statusCode, body]);
                    }
                    case 4: { // Client error
                        // If this is a 403 (Forbidden) usually means that the access token has expired, so get a new token and retry.
                        if (res.statusCode == 403 && retryOn403) {
                            self._logger('Encountered 403, retrying after grabbing new token.');
                            return self.get_token()
                                .then(function (tkn) {
                                    return self._make_request(tkn, endpoint, method, data, waitingRetryCount, retryOnServerErrorEnabled, false)
                                        .then(function (results) {
                                            return resolve(results);
                                        })
                                        .catch(function (err) {
                                            return reject(err);
                                        });
                                })
                                .catch(function (err) {
                                    return reject(err);
                                });
                        } else if (res.statusCode == 403) {
                            return reject('Received two 403\'s in a row. Not retrying again.');
                        }

                        return resolve([res.statusCode, body]);
                    }
                    case 5: {// Server Error

                        if (self.retryOnServerError > 0 && retryOnServerErrorEnabled) {
                            return self._make_request_helper(token, endpoint, method, data)
                                .then(function (results) {
                                    return resolve(results);
                                })
                                .catch(function (err) {
                                    return reject(err);
                                });
                        } else {
                            return reject('server error has occured: ' + res.statusCode + ' and body: ' + body);
                        }
                    }
                    default: {
                        return reject('Shouldn\'t have reached here. StatusCode: ' + res.statusCode + ' and Body: ' + body);
                    }
                }
                /* eslint-enable */
            });
        });
    }

    // TODO : clean up _make_request_helper() method
    _make_request_helper(token, endpoint, method, data) {
        let self = this;
        return new Promise((super_resolve, super_reject) => {
            return Promise.mapSeries(new Array(self.retryOnServerError + 1), () => {
                // eslint-disable-next-line no-unused-vars
                return new Promise((resolve, reject) => {
                    self._make_request(token, endpoint, method, data, 0, false, true)
                        .then((results) => {
                            return super_resolve(results);
                        })
                        .catch((err) => {
                            var errSplit = err.toString()
                                .split('server error');
                            if (errSplit.length >= 2) {
                                // Continue (aka try again)
                                return setTimeout(() => {
                                    self._logger('Got Server Error. Retrying Request.');
                                    return resolve();
                                }, self.retryDelay * 1000);
                            }

                            self._logger('This should not be reached! Please report a bug!');
                            return resolve();
                        });
                });
            })
            // eslint-disable-next-line no-unused-vars
                .then((results) => {
                    return super_reject('Did not succeed after numerous attempts.');
                })
                .catch((err) => {
                    return super_reject(err);
                });
        });
    }

    _method_helper(endpoint, data, URL, METHOD) {
        let self = this;
        return new Promise((resolve, reject) => {
            self.get_token()
                .then((token) => {
                    return self._make_request(token, URL + endpoint, METHOD, data, 0, true, true);
                })
                .then((results) => {
                    // Returning [resultCode, body]
                    return resolve(results);
                })
                .catch((err) => {
                    return reject(err);
                });
        });
    }

    get(endpoint, data) {
        return this._method_helper(endpoint, data, REGULAR_REDDIT_URL, 'GET');
    }

    post(endpoint, data) {
        return this._method_helper(endpoint, data, REGULAR_REDDIT_URL, 'POST');
    }

    patch(endpoint, data) {
        return this._method_helper(endpoint, data, REGULAR_REDDIT_URL, 'PATCH');
    }

    put(endpoint, data) {
        return this._method_helper(endpoint, data, REGULAR_REDDIT_URL, 'PUT');
    }

    del(endpoint, data) {
        return this._method_helper(endpoint, data, REGULAR_REDDIT_URL, 'DELETE');
    }
};
