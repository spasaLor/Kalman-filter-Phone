const { exec } = require('child_process');
const opcua = require ('node-opcua');

//Definizione connection strategy
const connectionStrategy = {
  initialDelay: 1000,
  maxRetry: 1
};
//Creazione client OPCUA con opzioni di sicurezza None dato che si utilizzerà un endopoint di tipo [None,None,Binary]
const client = opcua.OPCUAClient.create({
  applicationName: "MyClient",
  connectionStrategy: connectionStrategy,
  securityMode: opcua.MessageSecurityMode.None,
  securityPolicy: opcua.SecurityPolicy.None,
  endpointMustExist: false
});

const endpointUrl = "opc.tcp://localhost:4334/UA/MyServer";

//Funzione per eseguire comandi bash da JS usando la funzione exec
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Errore nell\'esecuzione:' +error);
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
//Funzione per ricavare i dati del giroscopio tramite termux
async function getGyroscopeData() {
  try {
    var data = {x:0,y:0,z:0};
    
    const command = 'termux-sensor -s gyroscope -n 1';
    const result = await executeCommand(command);

    const gyroscopeData = JSON.parse(result.stdout);

    data.x = gyroscopeData['gyroscope'].values[0];
    data.y = gyroscopeData['gyroscope'].values[1];
    data.z = gyroscopeData['gyroscope'].values[2];

    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}
//Funzione per ricavare i dati dell'accelerometro tramite termux
async function getAccelData() {
  try {
    var data = {x:0,y:0,z:0};
    const command = 'termux-sensor -s accelerometer -n 1';
    const result = await executeCommand(command);

    const accelerometerData = JSON.parse(result.stdout);

    data.x = accelerometerData['accelerometer-kx023'].values[0];
    data.y = accelerometerData['accelerometer-kx023'].values[1];
    data.z = accelerometerData['accelerometer-kx023'].values[2];

    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}
//Funzione per inviare i valori dei sensori al server
async function writeData (gyroData,accelData,session){
  try{
    const nodesToWrite = [{
      nodeId: 'ns=1;i=1022',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:gyroData.x
        }
      }
    },
    {
      nodeId: 'ns=1;i=1023',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:gyroData.y
        }
      }
    },
    {
      nodeId: 'ns=1;i=1024',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:gyroData.z
        }
      }
    },
    {
      nodeId: 'ns=1;i=1014',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:accelData.x
        }
      }
    },
    {
      nodeId: 'ns=1;i=1015',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:accelData.y
        }
      }
    },
    {
      nodeId: 'ns=1;i=1016',
      attributeId: opcua.AttributeIds.Value,
      value:{
        value:{
          dataType: opcua.DataType.Double,
          value:accelData.z
        }
      }
    }];
    session.write(nodesToWrite);
    console.log('Inviando al Server i dati ['+gyroData.x+', '+gyroData.y+', '+gyroData.z+'] ottenuti dal Girocopio');
    console.log('Inviando al Server i dati ['+accelData.x+', '+accelData.y+', '+accelData.z+'] ottenuti dall\' Accelerometro');
  }catch (error) {
    console.error('Error:', error);
  }
}
//Funzione per creare e gestire la subscription
async function handleSubscription (session){
  try {
   //Creazione subscription 
   const subscription = opcua.ClientSubscription.create(session, {
    requestedPublishingInterval: 3000,
    requestedLifetimeCount: 100,
    requestedMaxKeepAliveCount: 10,
    maxNotificationsPerPublish: 10,
    publishingEnabled: true,
    priority: 1
  });
  
  subscription
    .on("started", function() {
      console.log("Avvio subscription, ricevuto subscriptionId: ",subscription.subscriptionId);
    })
    .on("keepalive", function() {
      console.log("keepalive");
    })
    .on("terminated", function() {
      console.log("terminated");
    });
 
  //Setup monitored items
  const itemsToMonitor =[
    {
      nodeId: "ns=1;i=1030",
      attributeId: opcua.AttributeIds.Value
    },
    {
      nodeId: "ns=1;i=1031",
      attributeId: opcua.AttributeIds.Value
    }
  ];
  
  //Parametri creazione monitored Items
  const parameters = {
    samplingInterval: 3000,
    discardOldest: true,
    queueSize: 10,
    filter: new opcua.DataChangeFilter({
      deadbandType: 1,
      deadbandValue: 0.01,
      trigger: opcua.DataChangeTrigger.StatusValue
    })
  };

  //Assegnazione dei monitored items alla subscription
  itemsToMonitor.forEach((item)=> {
    subscription.monitor(item, parameters,opcua.TimestampsToReturn.Neither, (err, monitoredItem) => {
      if (err) {
        console.error("Error creating monitored item:", err);
        return;
      }

      console.log("Avvio monitoring del nodo: ", monitoredItem.itemToMonitor.nodeId.toString());
      monitoredItem.on("changed", (dataValue) => {

        if(monitoredItem.itemToMonitor.nodeId.toString() == "ns=1;i=1030"){
          console.log("Ricevuto nuovo valore di Rollio: ",dataValue.value.value);
        }
        else{
          console.log("Ricevuto nuovo valore di Beccheggio: ",dataValue.value.value);
        }
      });
    });
  });

  process.on("SIGINT", function () {
    console.log("Chiudendo la Subscription...");
    subscription.terminate();
    console.log("Chiudendo la Session...");
    client.closeSession(session);
    console.log("Terminando il programma");
    process.exit(1);
  });
  
} catch(error) {
  console.error('Error:', error);
}
}

async function main(client){
  await client.connect(endpointUrl);
  const session = await client.createSession();

  handleSubscription(session);
  setInterval(async ()=>{
    var gyro =  await getGyroscopeData();
    var accel = await getAccelData();
    await writeData(gyro,accel,session)
    },4000);
}


main(client);