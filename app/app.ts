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

import {  IDeviceState,
          IErrorState,
          IVacumCustomData,
          IDeviceCustomData,
          IVacuumCommand,
          IAcCommand} from "./types";

import { VacuumDevice } from "./vacumdevice"
import { AcPartnerDevice } from "./acdevice"
import { IMiDevice, MiError } from "./midevice"
import { UnexpectedInputPacket } from "./packet"

interface DeviceStatesMap {
  // tslint:disable-next-line
  [key: string]: any
}

const RESPONSE_SLEEP = 100;


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
      console.log('QUERY request '+ queryRequest.requestId, payload);

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
      
      return queryResponse;
    }
  

  // executeHandler send openpixelcontrol messages corresponding to light device commands.
  public executeHandler = async (executeRequest: smarthome.IntentFlow.ExecuteRequest):
    Promise<smarthome.IntentFlow.ExecuteResponse> => {
    
    let requestId = executeRequest.requestId
    // TODO(proppy): handle multiple inputs/commands.
    const command = executeRequest.inputs[0].payload.commands[0];
    console.log('EXECUTE request ' + requestId, command);

    // TODO(proppy): handle multiple executions.
    const execution = command.execution[0];

    // Create execution response to capture individual command
    // success/failure for each devices.
    const executeResponse =  new smarthome.Execute.Response.Builder()
      .setRequestId(requestId);
  
    await Promise.all(command.devices.map(async (google_device) => {
      try {
        let midevice = this.midevices[google_device.id];

        let deviceManager = this.app.getDeviceManager()
        await promiseFromCommand(deviceManager, executeRequest.requestId, google_device.id,
          midevice, execution.command, (execution.params as IVacuumCommand));
        
        await midevice.afterExecute(deviceManager, requestId, execution.command, execution.params)
        // return fresh status
        let result: IDeviceState = await promiseFromQuery(deviceManager, requestId, google_device.id, midevice, true)
        
        if (result.status=='SUCCESS')
          executeResponse.setSuccessState(google_device.id, result);
        else {
          let e = result as IErrorState;
          console.error("EXECUTE failed " + requestId,e, google_device);
          executeResponse.setErrorState(google_device.id, e.errorCode);
        }
      }
      catch (e) {
        let code;
        if (e instanceof UnexpectedInputPacket) {
          code = "networkJammingDetected"
        } else if (e instanceof MiError) {
          code = e.google_error
        } 
        console.error(e);
        executeResponse.setErrorState(google_device.id, "networkJammingDetected");// e.errorCode);
      }

    }));
    console.log("EXECUTE response "+requestId, executeResponse);
    return executeResponse.build();
  }
}

function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendHandshake(deviceManager:smarthome.DeviceManager, requestId: string, device: IMiDevice<any, any>) {
  const handshake : Promise<void> = deviceManager
          .send(device.makeHandshakeCommand(requestId))
          .then((result: smarthome.DataFlow.CommandSuccess) => {
            const udpResult = result as smarthome.DataFlow.UdpResponseData;

            if (!udpResult.udpResponse.responsePackets) {
              throw Error("empty handshake result")
            }
            console.log("handshake result", udpResult);
            device.onHandshake(udpResult.udpResponse.responsePackets)
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
      console.info("QUERY cached "+requestId, cache)
      return cache
    }
  }

  return await deviceManager.send(device.makeRequest(requestId, smarthome.Intents.QUERY, undefined))
          .then((result) => {
            let res = device.onQueryResponse(result as smarthome.DataFlow.UdpResponseData)
            console.log("QUERY response "+requestId, res);
            return res
          })
}

export async function promiseFromCommand(deviceManager:smarthome.DeviceManager, requestId: string, deviceId: string,
        device: IMiDevice<any, any>,
        command: string, params: IVacuumCommand|IAcCommand) : Promise<IDeviceState> {
        
  if (device.needsHandshake) {
      await sendHandshake(deviceManager, requestId, device)
    // }
  }

  return await deviceManager.send(device.makeRequest(requestId, command, params) )
        .then((result) => {
          console.log("EXECUTE result "+requestId, result);
          return device.onResponse(requestId, command, result as smarthome.DataFlow.UdpResponseData)
        })
}