const UUID_BASE = (x) => `0000${x}-0000-3512-2118-0009af100700`

const S = {
  GENERIC_ACCESS: { uuid: 0x1800, ch: {

  }},
  GENERIC_ATTRIBUTE: { uuid: 0x1801, ch: {

  }},
  DEVICE_INFORMATION: { uuid: 0x180a, ch: {

  }},
  FIRMWARE: { uuid: UUID_BASE('1530'), ch: {

  }},
  ALERT_NOTIFICATION: { uuid: 0x1811, ch: {

  }},
  IMMEDIATE_ALERT: { uuid: 0x1802, ch: {

  }},
  HEART_RATE: { uuid: 0x180d, ch: {

  }},
  MIBAND_1: { uuid: 0xfee0, ch: {
    TIME: 0x2a2b,
    BATTERY: UUID_BASE('0006')
  }},
  MIBAND_2: { uuid: 0xfee1, ch: {

  }}
};

class MiBand {

  async init(gatt) {
    await Promise.all([
      this._initMi1Service(gatt),
      // ...
    ])
  }

  async _initMi1Service(gatt) {
    const mi1 = await gatt.getPrimaryService(S.MIBAND_1.uuid);

    const [timeChar, battChar] = await Promise.all([
      mi1.getCharacteristic(S.MIBAND_1.ch.TIME),
      mi1.getCharacteristic(S.MIBAND_1.ch.BATTERY),
      // ...
    ]);

    this.timeChar = timeChar;
    this.battChar = battChar;
  }

  async getDate() {
    const data = await this.timeChar.readValue();
    console.log(data);
  
    const buf = new Uint8Array(data.buffer);
    const
      y = buf[1] * 256 + buf[0],
      mn = buf[2]-1,
      d = buf[3],
      h = buf[4],
      m = buf[5],
      s = buf[6]
    ;
  
    return new Date(y, mn, d, h, m, s);
  }

  async getBatteryInfo() {
    const data = await this.battChar.readValue();
    console.log(data);

    const buf = new Uint8Array(data.buffer);
    return {
      level: buf[0],
      charging: !!buf[2],
      chargeLevel: buf[19]
    };
  }

  async getHeartRate() {

  }
}


document.getElementById('pair').addEventListener('click', async () => {

  const optionalServices = Object.keys(S).map(k => S[k].uuid);
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      {name: 'MI Band 2'}
    ],
    optionalServices
  });

  console.log(`connect with id: ${device.id}, name: ${device.name}.`);
  console.log(device);

  console.log('will connect gatt');
  const gatt = await device.gatt.connect();
  console.log(gatt);

  const mi = new MiBand();
  await mi.init(gatt);
  console.log(await mi.getBatteryInfo());
});