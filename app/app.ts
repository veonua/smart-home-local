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
          IModeSetting,
          IVacumCustomData,
          IDeviceCustomData} from "./types";

import { VacuumDevice, fan_power } from "./vacumdevice"
import { AcPartnerDevice } from "./acdevice"
import { IMiDevice } from "./midevice"

//import * as e from "express";

const RESPONSE_SLEEP = 600;
const portNumber: number = 54321;

// HomeApp implements IDENTIFY and EXECUTE handler for smarthome local device execution.
export class HomeApp {
  private midevices: Record<string, IMiDevice<any>> = {};

  constructor(private readonly app: smarthome.App) {
      this.app = app;
  }

  // identifyHandlers decode UDP scan data and structured device information.
  public identifyHandler = (identifyRequest: smarthome.IntentFlow.IdentifyRequest):
    Promise<smarthome.IntentFlow.IdentifyResponse> => {
    console.log("IDENTIFY request", identifyRequest);
      
    const device = identifyRequest.inputs[0].payload.device;
    
    if (!device.mdnsScanData) 
      throw Error("invalid service "+name);

    let mdnsName = device.mdnsScanData.serviceName // "roborock-vacuum-s5_miio260426251._miio._udp.local"
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
      new Promise((resolve) => {}) // "lumi-acpartner-v1_miio57948646._miio._udp.local"
    }
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

    return new Promise((resolve) => {
      const identifyResponse = {
          intent: smarthome.Intents.IDENTIFY,
          requestId: identifyRequest.requestId,
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
        resolve(identifyResponse);
    });
  }

  // executeHandler send openpixelcontrol messages corresponding to light device commands.
  public executeHandler = (executeRequest: smarthome.IntentFlow.ExecuteRequest):
    Promise<smarthome.IntentFlow.ExecuteResponse> => {
    console.log("EXECUTE request:", executeRequest);
    // TODO(proppy): handle multiple inputs/commands.
    const command = executeRequest.inputs[0].payload.commands[0];
    // TODO(proppy): handle multiple executions.
    const execution = command.execution[0];

    // Create execution response to capture individual command
    // success/failure for each devices.
    const executeResponse =  new smarthome.Execute.Response.Builder()
      .setRequestId(executeRequest.requestId);
  
    return Promise.all(command.devices.map(async (google_device) => {
      
      try {
        let midevice = this.midevices[google_device.id];
        
        const result : IDeviceState = await promiseFromCommand(this.app.getDeviceManager(), executeRequest.requestId, google_device.id, 
        midevice, execution.command, (execution.params as IVacuumCommand));

        executeResponse.setSuccessState(google_device.id, result);
      }
      catch (e) {
        console.error(e);
        executeResponse.setErrorState(google_device.id, e.errorCode);
      }

    }))
    .then(() => {
      console.log("EXECUTE response", executeResponse);
      return executeResponse.build();
    });
  }
}

function _sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function promiseFromCommand(deviceManager:smarthome.DeviceManager, requestId: string, deviceId: string,
        device: IMiDevice<any>,
        command: string, params: IVacuumCommand) : Promise<IDeviceState> {
        
  if (device.needsHandshake) {
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

    console.debug("sending hanshake...");
    await handshake
    await _sleep(RESPONSE_SLEEP);

    ////////////
    if (!device.initialized) {
      const init_request = sendRequest(deviceManager, requestId, deviceId, device.convert("action.devices.QUERY", "") )
          .then((result: smarthome.DataFlow.UdpResponseData) => {
            console.log("EXECUTE init", result);
            device.onInit(result)
          })

      await init_request
      await _sleep(RESPONSE_SLEEP);
    }
    //////////////
  }
  

  var res = await sendRequest(deviceManager, requestId, deviceId, device.convert(command, params) )
        .then((result: smarthome.DataFlow.UdpResponseData) => {
          console.log("EXECUTE result", result);
          return device.onResponse(command, params, result)
        })

  if (device instanceof AcPartnerDevice) {
    res = await sendRequest(deviceManager, requestId, deviceId, device.convert("action.devices.QUERY", undefined) )
          .then((result: smarthome.DataFlow.UdpResponseData) => {
            console.log("EXECUTE after", result);
            return device.onResponse("action.devices.QUERY", undefined, result)
          })
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
            var resp = device.decode(result.udpResponse.responsePackets)
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
