/* eslint-disable */

const Pokello = require('./Pokello');

const pokello = new Pokello(
  {
    username: 'whs_dev_account',
    password: 'password',
    appID: 'AIzfp6rfKjD-aw',
    apiSecret: 'foKnEhnVpPY0wogZl6tyBLoWlsQ',
    // userAgent: 'this is a placeholder',
    retryOnWait: true,
    retryOnServerError: 5,
    retryDelay: 1,
    logs: true,
  });

const reddit_get = (api_access, endpoint, data) => {
  api_access.api.get(endpoint, data)
    .then(function (response) {
      let responseCode = response[0];
      let responseData = response[1];

      console.log("Received response (" + responseCode + "): ", responseData);
      console.log(responseData.data.children);
      console.log(responseData.data.children.length);
    })
    .catch(function (err) {
      return console.error("api request failed: " + err)
    });
};

//reddit_get(redditConn, "/r/funny/about/rules", {limit: 2});
reddit_get(
  pokello,
  "/r/stims/search.json?q=depressed&sort=new&include_over_18=on&restrict_sr=on",
  {limit: 1}); // max = 100


// TODO
// questions:
//  - what is the data field do?
// things to note:
//  - api request limit is 30 requests every 60 seconds
//  - i can get around the 100 post limit my title looping (ask joe)