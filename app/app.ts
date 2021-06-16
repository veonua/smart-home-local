/**
 * Copyright 2019, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/// <reference types="@google/local-home-sdk" />

import {  IVacuumCommand,
          IStatus,
          IStartStop,
          IDeviceState,
          IErrorState,
          IModeSetting,
          IVacumCustomData,
          IDeviceCustomData,
          IAcCommand,
          ISuccessState} from "./types";

import { VacuumDevice, fan_power } from "./vacumdevice"
import { AcPartnerDevice } from "./acdevice"
import { IMiDevice } from "./midevice"

interface DeviceStatesMap {
  // tslint:disable-next-line
  [key: string]: any
}

const RESPONSE_SLEEP = 500;
const portNumber: number = 54321;

// HomeApp implements IDENTIFY and EXECUTE handler for smarthome local device execution.
export class HomeApp {
  private midevices: Record<string, IMiDevice<any, any>> = {};

  constructor(private readonly app: smarthome.App) {
      this.app = app;
  }

  // identifyHandlers decode UDP scan data and structured device information.
  public identifyHandler = async(identifyRequest: smarthome.IntentFlow.IdentifyRequest):
    Promise<smarthome.IntentFlow.IdentifyResponse> => {
    console.log("IDENTIFY request", identifyRequest);
      
    const device = identifyRequest.inputs[0].payload.device;
    
    if (!device.mdnsScanData) 
      throw Error("invalid service "+device.id);

    const scanData = device.mdnsScanData as smarthome.IntentFlow.MdnsScanData;
      
    let mdnsName = scanData.serviceName // "roborock-vacuum-s5_miio260426251._miio._udp.local"
    if (!mdnsName.endsWith("._miio._udp.local"))
      throw Error("invalid service "+mdnsName);

    let parts = mdnsName.substr(0, mdnsName.length-17).split("_miio");
    let hwVersion = parts[0];
    let hwParts = parts[0].split("-")
    let deviceType = hwParts[1]
    let devNumber = parseInt(parts[1]);    
    let devId = parts[1];

    let cloudDevice = identifyRequest.devices.filter(x=>x.id==devId)[0];
    if (cloudDevice === undefined) {
      return  {
        requestId: identifyRequest.requestId,
        intent: smarthome.Intents.IDENTIFY,
        payload: {
          device: {
            id: devId,
          }
        }
      }; // "lumi-acpartner-v1_miio57948646._miio._udp.local"
    };
    let customData = cloudDevice.customData as IDeviceCustomData;

    var midevice = this.midevices[devId] 
    if (midevice === undefined) {
      switch (deviceType) {
        case "acpartner": midevice = new AcPartnerDevice(devNumber, customData.token, customData)
          break;
        case "vacuum":    midevice = new VacuumDevice(devNumber, customData.token, customData as IVacumCustomData);
          break;
        default: throw Error("unknown device type '" + deviceType + "' of" + mdnsName)
      }
      this.midevices[devId] = midevice
    }

    const identifyResponse: smarthome.IntentFlow.IdentifyResponse = {
        requestId: identifyRequest.requestId,
        intent: smarthome.Intents.IDENTIFY,
        payload: {
          device: {
            id: devId,
            type: midevice.type,
            deviceInfo: {
              manufacturer: hwParts[0],
              model: hwParts[2],
              hwVersion: hwVersion,
              swVersion: "3.3.9_001864",
            },
            isProxy: false,
            verificationId: devId,
          }
        },
      };
      console.log("IDENTIFY response", identifyResponse);
    return identifyResponse;
  }

  public reachableDevicesHandler = async(
    reachableDevicesRequest: smarthome.IntentFlow.ReachableDevicesRequest):
    Promise<smarthome.IntentFlow.ReachableDevicesResponse> => {
      // I don't know what is it
      console.log(`REACHABLE_DEVICES request ${
          JSON.stringify(reachableDevicesRequest, null, 2)}`);

      const proxyDeviceId =
          reachableDevicesRequest.inputs[0].payload.device.id;
          
      const devices = reachableDevicesRequest.inputs.flatMap((d) => {
        const customData = d.payload.device.customData as IDeviceCustomData;
        //if (customData.proxy === proxyDeviceId) {
        //  return [{verificationId: `${proxyDeviceId}-${customData.channel}`}];
        //}
        return [];
      });
      const reachableDevicesResponse = {
        intent: smarthome.Intents.REACHABLE_DEVICES,
        requestId: reachableDevicesRequest.requestId,
        payload: {
          devices,
        },
      };
      console.log(`REACHABLE_DEVICES response ${
          JSON.stringify(reachableDevicesResponse, null, 2)}`);
      return reachableDevicesResponse;
    }
  
  public queryHandler = async (queryRequest: smarthome.IntentFlow.QueryRequest): 
    Promise<smarthome.IntentFlow.QueryResponse> => {
      const payload = queryRequest.inputs[0].payload;
      console.log('QUERY request', payload);

      const deviceStates: DeviceStatesMap = {}
      await Promise.all(payload.devices.map(async (google_device) => {
        let midevice = null
        try {
          midevice = this.midevices[google_device.id];
  
          deviceStates[google_device.id] = await promiseFromQuery(this.app.getDeviceManager(), queryRequest.requestId, google_device.id,
            midevice);
        }
        catch (e) {
          console.error(e);
          deviceStates[google_device.id] = midevice?.cachedQuery ?? { customData: e.errorCode };
        }
      }));
      
      let queryResponse : smarthome.IntentFlow.QueryResponse = {
        requestId: queryRequest.requestId,
        payload: {
          devices: deviceStates
        }
      }
      
      //console.log("Query response", queryResponse);
      return queryResponse;
    }
  

  // executeHandler send openpixelcontrol messages corresponding to light device commands.
  public executeHandler = async (executeRequest: smarthome.IntentFlow.ExecuteRequest):
    Promise<smarthome.IntentFlow.ExecuteResponse> => {
      
    // TODO(proppy): handle multiple inputs/commands.
    const command = executeRequest.inputs[0].payload.commands[0];
    console.log('EXECUTE request:', command);

    // TODO(proppy): handle multiple executions.
    const execution = command.execution[0];

    // Create execution response to capture individual command
    // success/failure for each devices.
    const executeResponse =  new smarthome.Execute.Response.Builder()
      .setRequestId(executeRequest.requestId);
  
    await Promise.all(command.devices.map(async (google_device) => {
      try {
        let midevice = this.midevices[google_device.id];

        const result: IDeviceState = await promiseFromCommand(this.app.getDeviceManager(), executeRequest.requestId, google_device.id,
          midevice, execution.command, (execution.params as IVacuumCommand));
        
        if (result.status=='SUCCESS')
          executeResponse.setSuccessState(google_device.id, result);
        else {
          let e = result as IErrorState;
          console.error("EXECUTE failed",e, google_device);
          executeResponse.setErrorState(google_device.id, e.errorCode);
        }
      }
      catch (e) {
        console.error(e);
        executeResponse.setErrorState(google_device.id, e.errorCode);
      }

    }));
    console.log("EXECUTE response", executeResponse);
    return executeResponse.build();
  }
}

function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendHandshake(deviceManager:smarthome.DeviceManager, requestId: string, device: IMiDevice<any, any>) {
  const handshake : Promise<void> = deviceManager
          .send(device.makeHandshakeCommand(requestId, portNumber))
          .then((result: smarthome.DataFlow.CommandSuccess) => {
            const udpResult = result as smarthome.DataFlow.UdpResponseData;

            console.log("handshake result", udpResult);
            let response = ""
            if (udpResult.udpResponse.responsePackets) {
              response = udpResult.udpResponse.responsePackets[0];
              // 21310020000000000F85CA0B5F183C88FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
              // 2131002000000000037439E600013E6A00000000000000000000000000000000
            } 
            
            if (!response) {
              const device_hex = ("00000000" + device.deviceId.toString(16)).substr(-8);
              response = "2131002000000000" + device_hex + "5d53e8ab" + device.token
            }
            
            device.onHandshake(response)            
          })

    await handshake
    await _sleep(RESPONSE_SLEEP);
}

export async function promiseFromQuery(deviceManager:smarthome.DeviceManager, requestId: string, deviceId: string,
  device: IMiDevice<any, any>, noCache:boolean = false) {
  if (device.needsHandshake) {
      await sendHandshake(deviceManager, requestId, device)
  }

  if (!noCache) {
    const cache = device.cachedQuery
    if (cache) {
      console.info("QUERY cached", cache)
      return cache
    }
  }

  return await sendRequest(deviceManager, requestId, deviceId, device.convert(smarthome.Intents.QUERY, undefined) )
          .then((result: smarthome.DataFlow.UdpResponseData) => {
            let res = device.onResponse(smarthome.Intents.QUERY, undefined, result)
            console.log("QUERY response", res);
            return res
          })
}

export async function promiseFromCommand(deviceManager:smarthome.DeviceManager, requestId: string, deviceId: string,
        device: IMiDevice<any, any>,
        command: string, params: IVacuumCommand|IAcCommand) : Promise<IDeviceState> {
        
  if (device.needsHandshake) {
    if (!device.initialized) {
      //////////// Query should initialise the device before. so never should be happening
      console.warn("force QUERY");
      await promiseFromQuery(deviceManager, requestId, deviceId, device, true)
    } else {
      await sendHandshake(deviceManager, requestId, device)
    }
  }

  var res = await sendRequest(deviceManager, requestId, deviceId, device.convert(command, params) )
        .then((result: smarthome.DataFlow.UdpResponseData) => {
          console.log("EXECUTE result", result);
          return device.onResponse(command, params, result)
        })

  if (res.status!="SUCCESS") {
    return res
  }

  if (device instanceof AcPartnerDevice) {
      await _sleep(RESPONSE_SLEEP);    
      res = await promiseFromQuery(deviceManager, requestId, deviceId, device, true)
  }

  if (device instanceof VacuumDevice) {
    device.status = { state:5 } as IStatus
    switch (command) {
      case "action.devices.commands.SetModes": {
        device.fan_power = fan_power( (params as IModeSetting).updateModeSettings.mode )
        break;
      }

      case "action.devices.commands.StartStop": {
        const new_mode = device.resetModeIfNeed((params as IStartStop))
        if (new_mode) {
          await _sleep(RESPONSE_SLEEP);
          await sendRequest(deviceManager, requestId, deviceId, device.convert_fan_power(new_mode))
            .then((result: smarthome.DataFlow.UdpResponseData) => {
            console.log("EXECUTE set default mode ", result);
            try {
              device.decode(result.udpResponse.responsePackets)
            } catch (e) {
              console.error("set default mode", e)
            }
          })
        }
      }
    }
  }
      
  return res
}

async function sendRequest(
    deviceManager:smarthome.DeviceManager, 
    requestId:string, 
    deviceId:string, 
    buf:Buffer,
    expectedResponse:boolean=true) : Promise<smarthome.DataFlow.UdpResponseData> {

  const req = new smarthome.DataFlow.UdpRequestData() 
  req.requestId = requestId;
  req.deviceId = deviceId;
  req.port = portNumber;
  req.data = buf.toString('hex');
  if (expectedResponse)
    req.expectedResponsePackets = 1;
  
  return await deviceManager.send(req) as smarthome.DataFlow.UdpResponseData;
}
