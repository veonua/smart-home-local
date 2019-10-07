/* Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This auth is going to use the Authorization Code flow, described in the docs:
 * https://developers.google.com/actions/identity/oauth2-code-flow
 */

import * as express from 'express'
import * as util from 'util'
import { Headers } from 'actions-on-google'
import { UploadedFile } from 'express-fileupload';
import { loadFlole } from './flole';


//import * as Firestore from './firestore'

/**
 * A function that gets the user id from an access token.
 * Replace this functionality with your own OAuth provider.
 *
 * @param headers HTTP request headers
 * @return The user id
 */
export async function getUser(headers: Headers): Promise<string> {
  const authorization = headers.authorization
  const accessToken = (authorization as string).substr(7)
  return accessToken //await Firestore.getUserId(accessToken)
}

/**
 * A function that adds /login, /fakeauth, /faketoken endpoints to an
 * Express server. Replace this with your own OAuth endpoints.
 *
 * @param expressApp Express app
 */
export async function registerAuthEndpoints(expressApp: express.Express) {
  expressApp.get('/login2', express.static('login.html'))

  expressApp.get('/login', function (req, res) {
    res.sendFile(__dirname + '/login.html');
  })

  expressApp.post('/login', async (req, res) => {
    if (req.files === undefined)
      return res.redirect("/login?no_file");
    
    const file = (req.files.file1 as UploadedFile)
    if (file === undefined) {return res.redirect("/login?no_file")}
    let fl = loadFlole(file.data)[0]

    const deviceId = ("00000000" + fl.d.toString(16)).substr(-8);
    const code = fl.e + "_" + deviceId + "_" + fl.h

    const responseurl = util.format('%s?code=%s&state=%s',
      decodeURIComponent(req.query.redirect_uri), code,
      req.query.state)
    //console.log(responseurl)
    
    return res.redirect(responseurl)
    // return res.redirect(util.format(
    //   '%s?client_id=%s&redirect_uri=%s&state=%s&response_type=code',
    //   '/frontend', req.body.client_id,
    //   encodeURIComponent(req.body.redirect_uri), req.body.state))
  })

  expressApp.get('/fakeauth', async (req, res) => {
    const responseurl = util.format('%s?code=%s&state=%s',
      decodeURIComponent(req.query.redirect_uri), 'xxxxxx',
      req.query.state)
    console.log(responseurl)
    return res.redirect(responseurl)
  })

  expressApp.all('/faketoken', async (req, res) => {
    //console.log(req.body)
    
    const grantType = req.query.grant_type
      ? req.query.grant_type : req.body.grant_type
    const secondsInDay = 86400 // 60 * 60 * 24
    const HTTP_STATUS_OK = 200
    console.log(`Grant type ${grantType}`)

    const token = req.body.refresh_token
      ? req.body.refresh_token : req.body.code;

    console.log(`Code ${token}`)

    let obj
    if (grantType === 'authorization_code') {
      obj = {
        token_type: 'bearer',
        access_token: token,
        refresh_token: token,
        expires_in: secondsInDay,
      }
    } else if (grantType === 'refresh_token') {
      obj = {
        token_type: 'bearer',
        access_token: token,
        expires_in: secondsInDay,
      }
    }
    res.status(HTTP_STATUS_OK).json(obj)

    console.log(` Finish -- Grant type ${grantType}`)

  })
}
