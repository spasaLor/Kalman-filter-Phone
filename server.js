const opcua = require("node-opcua");
const AHRS = require('ahrs');
(async ()=>{
    try{
        //Creazione endpoint tcp del server con le varie opzioni riguardo porta e protocolli di sicurezza [none,none,Binary]
        const server = new opcua.OPCUAServer({
            
            port: 4334,
            resourcePath: "/UA/MyServer",
            nodeset_filename: opcua.nodesets.standard,
            securityModes: [opcua.MessageSecurityMode.None],
            securityPolicies: [opcua.SecurityPolicy.None],
        });

        await server.initialize();

        const addressSpace= server.engine.addressSpace
        const namespace = addressSpace.getOwnNamespace();
        //Creazione cartella phones per contenere più istanze di telefoni
        const phones = namespace.addFolder(opcua.ObjectIds.ObjectsFolder,{
            browseName: "phones",
            subtypeOf: "BaseFolderType",
        })
        
        //Creazione cartella per contenere i dati relativi ad un telefono
        const phone1 = namespace.addFolder(phones,{
            browseName: "phone1",
            subtypeOf: "BaseFolderType",
        })

        //Definizione dell'ObjectType phoneSensorType 
        const phoneSensorType = namespace.addObjectType({
            browseName: "PhoneSensorType",
            subtypeOf: "BaseObjectType",
        });

        //Inserimento dei componenti di phoneSensorType
        var xValue = namespace.addVariable({
            componentOf: phoneSensorType,
            browseName: "X",
            dataType: opcua.DataType.Double,
            modellingRule: "Mandatory"
        });

        var yValue = namespace.addVariable({
            componentOf: phoneSensorType,
            browseName: "Y",
            dataType: opcua.DataType.Double,
            modellingRule: "Mandatory"
        });

        var zValue = namespace.addVariable({
            componentOf: phoneSensorType,
            browseName: "Z",
            dataType: opcua.DataType.Double,
            modellingRule: "Mandatory"
        });

        var man = namespace.addVariable({
            propertyOf: phoneSensorType,
            browseName: "manufacturer",
            dataType: opcua.DataType.String,
            modellingRule: "Mandatory"
        })

        var mod = namespace.addVariable({
            propertyOf: phoneSensorType,
            browseName: "model",
            dataType: opcua.DataType.String,
            modellingRule: "Mandatory"
        })

        var mesData = namespace.addVariable({
            propertyOf: phoneSensorType,
            browseName: "measurement_data",
            dataType: opcua.DataType.String,
            modellingRule: "Mandatory"
        })

        var unit = namespace.addVariable({
            propertyOf: phoneSensorType,
            browseName: "measurement_unit",
            dataType: opcua.DataType.String,
            modellingRule: "Mandatory"
        })
        
        const orientationType = namespace.addObjectType({
            browseName: "OrientationType",
            subtypeOf: "BaseObjectType",
        });
        
        var roll = namespace.addVariable({
            componentOf: orientationType,
            browseName: "Roll",
            dataType: opcua.DataType.Double,
            modellingRule: "Mandatory"
        });

        var pitch = namespace.addVariable({
            componentOf: orientationType,
            browseName: "Pitch",
            dataType: opcua.DataType.Double,
            modellingRule: "Mandatory"
        });

        //Creazione delle istanze dei 3 sensori
        const accel = phoneSensorType.instantiate({
            browseName: "Accelerometer",
            organizedBy: phone1,
        });

        accel.manufacturer.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "Kionix"
        });

        accel.model.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "kx-023"
        });

        accel.measurement_data.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "Gravitational Acceleration"
        });

        accel.measurement_unit.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "m/s^2"
        });

        const gyro = phoneSensorType.instantiate({
            browseName: "Gyroscope",
            organizedBy: phone1,
        });

        gyro.manufacturer.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "Kionix"
        });

        gyro.model.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "kxg-03"
        });

        gyro.measurement_data.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "Rotational Speed"
        });

        gyro.measurement_unit.setValueFromSource({
            dataType:opcua.DataType.String,
            value: "degrees per second"
        });
        
        //Creare tipo orientationType
        const orient = orientationType.instantiate({
            browseName: "Orientation",
            organizedBy: phone1,
        });


        // Implementazione Madgwick Filter 

        async function updateNodes(gyroscope,accelerometer,orientation,madgwick) {
            
            const gyroX = gyroscope.x;
            const gyroY = gyroscope.y;
            const gyroZ = gyroscope.z;
            
            //Conversione da m/s^2 a g
            const accelX = accelerometer.x/9.81;
            const accelY = accelerometer.y/9.81;
            const accelZ = accelerometer.z/9.81;
            
            madgwick.update(gyroX, gyroY, gyroZ, accelX, accelY, accelZ);
            eurlerAngles=madgwick.getEulerAngles();
            orientation.roll=eurlerAngles["roll"];
            orientation.pitch=eurlerAngles["pitch"];
            
            // Output fused orientation
            console.log("Orientation (Rollio, Beccheggio):", orientation.roll, orientation.pitch);
            var bind1={
                get: function(){
                return new opcua.Variant({dataType: opcua.DataType.Double, value: orientation.roll});
                    } 
                }
            var bind2 ={
                get: function(){
                return new opcua.Variant({dataType: opcua.DataType.Double, value: orientation.pitch});
                    } 
                }
            orient.getComponentByName("Roll").bindVariable(bind1,true);
            orient.getComponentByName("Pitch").bindVariable(bind2,true);

        }

        async function runUpdate(){
            // Lettura dati dai nodi dei sensori e definizione dell'oggetto orientation
            let gyroscope = {x: gyro.getComponentByName("X").readValue().value.value, y: gyro.getComponentByName("Y").readValue().value.value, z: gyro.getComponentByName("Z").readValue().value.value };
            let accelerometer = { x: accel.getComponentByName("X").readValue().value.value, y: accel.getComponentByName("Y").readValue().value.value, z: accel.getComponentByName("Z").readValue().value.value};
            let orientation = { roll: 0, pitch: 0};
            const madgwick = new AHRS({sampleInterval: 20,algorithm: 'Madgwick',beta: 0.4});
            //chiamata di funzione complementaryFilter
            updateNodes(gyroscope,accelerometer,orientation,madgwick);
            //riesegue questa funzione ogni 3 secondi
            setTimeout(runUpdate, 3000);

        }
    
    await server.start();    
    console.log("server started at", server.getEndpointUrl());
    await runUpdate();
                
    }
    catch(err){
        console.log(err);
        process.exit(1);
    }
})();