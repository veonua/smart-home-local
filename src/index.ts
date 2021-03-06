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
 * This is the main server code that processes requests and sends responses
 * back to users and to the HomeGraph.
 */

// Express imports
import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as morgan from 'morgan'
import * as fileupload from 'express-fileupload'
import { AddressInfo } from 'net'
import { ApiClientObjectMap } from 'actions-on-google/dist/common'

// Smart home imports
import {
  smarthome,
  SmartHomeV1ExecuteResponseCommands,
  SmartHomeV1SyncDevices,
  Headers,
} from 'actions-on-google'

// Local imports
//import * as Firestore from './firestore'
import * as Auth from './auth-provider'
import * as Config from './config-provider'

const maps = require('./maps.json')

const expressApp = express()
expressApp.use(fileupload())
expressApp.use(cors())
expressApp.use(morgan('dev'))
expressApp.use(bodyParser.json())
expressApp.use(bodyParser.urlencoded({extended: true}))
expressApp.set('trust proxy', 1)

Auth.registerAuthEndpoints(expressApp)


const jwt = require('./smart-home-key.json')

const app = smarthome({
  jwt,
  debug: true,
})

// Array could be of any type
// tslint:disable-next-line
async function asyncForEach(array: any[], callback: Function) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

async function getUserIdOrThrow(headers: Headers): Promise<string> {
  const userId = await Auth.getUser(headers)
  //const userExists = await Firestore.userExists(userId)
  return userId
}

function empty_map() {
  var seg : any = {}
  for (var i=1; i<=50; i++) {
    seg['room '+i] = { segments : [i]}
  }

  return {segments: seg, 
          fan_power: 101,
          targets : { service: [22500,25500] },
        }
}

function extract_zones(map:any): string[] {
  var res : string[] = []

  if (map.hasOwnProperty('zones')) {
    res = res.concat( Object.keys(map.zones) )
  }
  if (map.hasOwnProperty('targets')) {
    res = res.concat( Object.keys(map.targets) )
  }
  if (map.hasOwnProperty('segments')) {
    res = res.concat( Object.keys(map.segments) )
  }

  return res
}

function lumiAcPartner(deviceId:string) : SmartHomeV1SyncDevices {
  /*
      commandOnlyOnOff: false,
      commandOnlyFanSpeed: false,
      commandOnlyTemperatureSetting: false,
  */
  const swing = {
    name: 'swing',
    name_values: [{
      name_synonym: ["swing"],
      lang: "en"
    }],
    settings: [
      {
        setting_name: '0',
        setting_values: [{
          setting_synonym: ["Off"],
          lang: "en"
        }],
      },
      {
        setting_name: '1',
        setting_values: [{
          setting_synonym: ["On"],
          lang: "en"
        }],
      }]
    }

          
  return {
    type: 'action.devices.types.THERMOSTAT',
    traits: [
        'action.devices.traits.FanSpeed',
        'action.devices.traits.TemperatureSetting'
    ],
    id: deviceId,
    otherDeviceIds: [{
      deviceId: deviceId,
    }],
    name: {
      name: "lumi-acpartner",
      defaultNames: ['Air Conditioner'],
      nicknames: ['Toshiba Air Conditioner'],
    },
    willReportState: true,
    attributes: {
      availableThermostatModes: ['cool','dry','heat','eco','fan-only', 'off', 'on'],
      commandOnlyOnOff: false,
      commandOnlyFanSpeed: false,
      commandOnlyTemperatureSetting: false,
      queryOnlyTemperatureSetting: false,
      availableModes: [
        swing
      ],
      thermostatTemperatureUnit: 'C',
      thermostatTemperatureRange: {
        minThresholdCelsius: 17,
        maxThresholdCelsius: 30
      },
      availableFanSpeeds: {
        speeds: [
          {
            speed_name: '0',
            speed_values: [
              {
                speed_synonym: ['Low', 'speed 1'],
                lang: 'en'
              }
            ]
          },
          {
            speed_name: '1',
            speed_values: [
              {
                speed_synonym: ['Medium', 'speed 2'],
                lang: 'en'
              }
            ]
          },
          {
            speed_name: '2',
            speed_values: [
              {
                speed_synonym: ['High','speed 3'],
                lang: 'en'
              }
            ]
          },
          {
            speed_name: '3',
            speed_values: [
              {
                speed_synonym: ['Auto','auto speed'],
                lang: 'en'
              }
            ]
          }
        ],
        ordered: true
      }
    },
    deviceInfo: {
      manufacturer: 'Aqara',
      model: 'lumi.acpartner.v1',
      hwVersion: 'MW300',
      swVersion: '1.4.1_157'
    },
    customData: {
      token: 'e53f67a46ac37d497588adc897c93844',
    },
  }
}

app.onSync(async (body, headers) => {
  const tokenDevice = (await getUserIdOrThrow(headers)).split('_')
  const devices: SmartHomeV1SyncDevices[] = []
  
  const mode_fan = {
    name: 'mode',
    name_values: [{
      name_synonym: ["mode", "power", "level", "suction"],
      lang: "en"
    }],
    settings: [
      {
        setting_name: '105',
        setting_values: [{
          setting_synonym: ["Mopping", "mop the floor"],
          lang: "en"
        }],
      },
      {
        setting_name: '101',
        setting_values: [{
          setting_synonym: ["Low", "quiet", "silent", "min"],
          lang: "en"
        }],
      },
      {
        setting_name: '102',
        setting_values: [{
          setting_synonym: ["Balanced", "normal"],
          lang: "en"
        }],
      },
      {
        setting_name: '103',
        setting_values: [{
          setting_synonym: ["High", "full"],
          lang: "en"
        }],
      },
      {
        setting_name: '104',
        setting_values: [{
          setting_synonym: ["Turbo", "max"],
          lang: "en"
        }],
      }
      ],
      ordered: true
  };

  let id=0;

  //for (let fl of flole_config) {
    id++;
    const deviceNo = tokenDevice[1]
    const deviceId = ""+parseInt(deviceNo, 16)  // "roborock-vacuum-s5_miio"+ mdnsname: roborock-vacuum-s5_miio260426251._miio._udp.local
    
    console.log("Sync '"+deviceId+"'")
    let customData : any = {}
    if (deviceId in maps){
      console.log('loading map...')
      customData = maps[deviceId]
    } else {
      console.log("can not find the map, send default")
      customData = empty_map()
    }
    let availableZones = extract_zones(customData)
    customData.token = tokenDevice[0]; //flole_config[0].e
    
    const vacuum: SmartHomeV1SyncDevices = {
      id: deviceId,
      type: "action.devices.types.VACUUM",
      traits: [
        "action.devices.traits.StartStop",
        "action.devices.traits.Modes",
        "action.devices.traits.Locator",
        "action.devices.traits.EnergyStorage",
        "action.devices.traits.Dock",
      ],
      name: {
        defaultNames: ["Roborock"],
        name: "Roborock",
        nicknames: ["Roborock"],
      },
      attributes: {
        pausable: true,
        queryOnlyEnergyStorage: true,
        availableModes: [
          mode_fan
        ],
        availableZones: availableZones
      },
      customData: customData,
      deviceInfo: {
        manufacturer: "roborock",
        model: "s5",
        hwVersion: "1",
        swVersion: "1.2",
      },
      willReportState: true,
      otherDeviceIds: [{deviceId: deviceId}], // local execution
    }
    devices.push(vacuum)
    if (deviceId=="260426251") {
      // hack: add AC
      devices.push(lumiAcPartner("57948646"))
    }

    // id++;    
    // const mop : SmartHomeV1SyncDevices = {
    //   id: id.toString(),
    //   type: "action.devices.types.MOP",
    //   traits: [
    //     'action.devices.traits.StartStop',
    //     'action.devices.traits.Dock'
    //   ],
    //   name: {
    //     defaultNames: ["Mop-Roborock"],
    //     name: "Mop-Roborock",//fl.f,
    //     nicknames: ["Mop"],
    //   },
    //   attributes: {
    //     pausable: true,
    //     availableZones: availableZones
    //   },
    //   customData: customData,
    //   deviceInfo: {
    //     manufacturer: deviceInfo[0],
    //     model: deviceInfo[2]="-mop",
    //     hwVersion: "1m",
    //     swVersion: "1.2m",
    //   },
    //   willReportState: true,
    //   otherDeviceIds: [{deviceId:"mop-roborock-" + deviceId}], // local execution
    // }
  //devices.push(mop)
  //}

  return {
    requestId: body.requestId,
    payload: {
      agentUserId: deviceNo,
      devices,
    },
  }
})

type StatesMap = ApiClientObjectMap<any>

interface DeviceStatesMap {
  // tslint:disable-next-line
  [key: string]: any
}
app.onQuery(async (body, headers) => {
  const userId = await getUserIdOrThrow(headers)
  const deviceStates: DeviceStatesMap = {}
  const {devices} = body.inputs[0].payload
  await asyncForEach(devices, async (device: {id: string}) => {
    if (device.id == '57948646') {
      deviceStates[device.id] = {
        status: "SUCCESS",
        online: true,
        thermostatMode: "off",
        thermostatTemperatureSetpoint: 23,
        thermostatTemperatureAmbient: 10,
      }
    } else {
      deviceStates[device.id] = {
        online: true,
        currentModeSettings: {
          mode: '102'
        },
        activeZones : []
      }
    }
  })
  return {
    requestId: body.requestId,
    payload: {
      devices: deviceStates,
    },
  }
})

app.onExecute(async (body, headers) => {
  const userId = await getUserIdOrThrow(headers)
  const commands: SmartHomeV1ExecuteResponseCommands[] = [{
    ids: [],
    status: 'SUCCESS',
    states: {},
  }]

  const {devices, execution} = body.inputs[0].payload.commands[0]
  await asyncForEach(devices, async (device: {id: string}) => {
    try {
      //const states = await Firestore.execute(userId, device.id, execution[0])
      const command = execution[0].command;

      let states : StatesMap = {
        online: true,
        currentModeSettings: {
          mode: 102
        },
        activeZones : [],
        descriptiveCapacityRemaining: "HIGH",
        capacityRemaining: [
          {
            unit: "PERCENTAGE",
            rawValue: 90
          }
        ]
      }
      
      if (command === 'action.devices.commands.Locate') {
        states = {generatedAlert: true}
      }

      commands[0].ids.push(device.id)
      commands[0].states = states

      // reports error, without it works

      // Report state back to Homegraph
      // await app.reportState({
      //   agentUserId: userId,
      //   requestId: Math.random().toString(),
      //   payload: {
      //     devices: {
      //       states: {
      //         [device.id]: states,
      //       },
      //     },
      //   },
      // })
    } catch (e) {
      commands.push({
        ids: [device.id],
        status: 'ERROR',
        errorCode: e.message,
        debugString: 'err: ' + e,
      })
    }
  })

  return {
    requestId: body.requestId,
    payload: {
      commands,
    },
  }
})

app.onDisconnect(async (body, headers) => {
  const userId = await getUserIdOrThrow(headers)
  //await Firestore.disconnect(userId)
})

expressApp.post('/smarthome', app)

expressApp.post('/smarthome/update', async (req, res) => {
  // console.log(req.body)
  const {userId, deviceId, name, nickname, states} = req.body
  try {
    //await Firestore.updateDevice(userId, deviceId, name, nickname, states)
    const reportStateResponse = await app.reportState({
      agentUserId: userId,
      requestId: Math.random().toString(),
      payload: {
        devices: {
          states: {
            [deviceId]: states,
          },
        },
      },
    })
    // console.log(reportStateResponse)
    res.status(200).send('OK')
  } catch(e) {
    console.error(e)
    res.status(400).send(`Error reporting state: ${e}`)
  }
})

expressApp.post('/smarthome/create', async (req, res) => {
  // console.log(req.body)
  const {userId, data} = req.body
  try {
    //await Firestore.addDevice(userId, data)
    await app.requestSync(userId)
  } catch(e) {
    console.error(e)
  } finally {
    res.status(200).send('OK')
  }
})

expressApp.post('/smarthome/delete', async (req, res) => {
  // console.log(req.body)
  const {userId, deviceId} = req.body
  try {
    //await Firestore.deleteDevice(userId, deviceId)
    await app.requestSync(userId)
  } catch(e) {
    console.error(e)
  } finally {
    res.status(200).send('OK')
  }
})


expressApp.get('/local.html', function (req, res) {
  res.sendFile(__dirname + '/index.html')
})

expressApp.get('/bundle.js', function (req, res) {
  res.sendFile(__dirname + '/bundle.js')
})


const appPort = process.env.PORT || Config.expressPort

const expressServer = expressApp.listen(appPort, () => {
  const server = expressServer.address() as AddressInfo
  const {address, port} = server

  console.log(`Smart home server listening at ${address}:${port}`)
})
