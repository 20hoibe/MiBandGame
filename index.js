const UUID_BASE = (x) => `0000${x}-0000-3512-2118-0009af100700`

const SERVICES = {
  GENERIC_ACCESS: 0x1800,
  GENERIC_ATTRIBUTE: 0x1801,
  DEVICE_INFORMATION: 0x180a,
  FIRMWARE: UUID_BASE('1530'),
  ALERT_NOTIFICATION: 0x1811,
  IMMEDIATE_ALERT: 0x1802,
  HEART_RATE: 0x180d,
  MIBAND_1: 0xfee0,
  MIBAND_2: 0xfee1
};

const CHARACTERISTICS = {
  TIME: 0x2a2b
};

class MiBand {
  async init(gatt) {
    const [mi1Service] = await Promise.all([
      gatt.getPrimaryService(SERVICES.MIBAND_1),
      // ...
    ]);

    this.mi1Service = mi1Service;
  }

  async getDate() {
    const timeChar = await this.mi1Service.getCharacteristic(CHARACTERISTICS.TIME);
    console.log(timeChar);
  
    const data = await timeChar.readValue();
    console.log(data);
  
    // not working correctly
    const buf = new Uint8Array(data.buffer);
    const
      year = buf[1] * 256 + buf[0],
      mon = 12-buf[2],
      day = buf[5],
      hrs = buf[4],
      min = buf[5],
      sec = buf[6],
      msec = buf[8] * 1000 / 256
    ;
  
    // sth. is maybe wrong here :D +/- a few minutes
    return new Date(year, mon, 1);
  }

  async getHeartRate() {

  }
}


document.getElementById('pair').addEventListener('click', async () => {

  const device = await navigator.bluetooth.requestDevice({
    filters: [
      {name: 'MI Band 2'}
    ],
    optionalServices: Object.keys(SERVICES).map(k => SERVICES[k])
  });

  console.log(`connect with id: ${device.id}, name: ${device.name}.`);
  console.log(device);

  console.log('will connect gatt');
  const gatt = await device.gatt.connect();
  console.log(gatt);

  const mi = new MiBand();
  await mi.init(gatt);
  console.log(await mi.getDate());
});