
interface IFlole {
  // mdns = roborock-vacuum-s5_miio260426251._miio._udp.local
    h:string, // device model - roborock.vacuum.s5
    d:number, // device ID    - 260426251
    e:string, // token
    j:number, // ??
    g: number, // device list order
    c:string, // IP
    f:string,  // device name - Robot vacuum
    a:string, // server sg
    b:string, // email,
    i:string  // password?
  }
  
export function loadFlole(buf:Buffer) : IFlole[] {
    const base64str = buf.toString("ascii");
    const encrypted = new Buffer(base64str, 'base64') 
    const Blowfish = require('egoroof-blowfish');
    const bf = new Blowfish('109876544BNNMOL', Blowfish.MODE.ECB, Blowfish.PADDING.NULL); // only key isn't optional 
    const decoded = bf.decode(encrypted, Blowfish.TYPE.STRING); // type is optional
    return JSON.parse(decoded.substring(0, decoded.indexOf('}]')+2))
}
  