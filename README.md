# node-red-contrib-mongodb3
MongoDB node driver 3.0 interface for Node-RED

based on [node-red-bluemix-nodes](https://github.com/node-red/node-red-bluemix-nodes/tree/master/mongo) and [MongoDB 3 Driver](http://mongodb.github.io/node-mongodb-native/3.0)

Please refer to the [mongoDB node driver 'Collection' documentation](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) to read about each operation.

# Usage
* To pass a single parameter to an operation use `msg.payload` as your parameter (eg `{_id: 1243}`)
* To pass multiple parameters to an operation fill `msg.payload` with an array 
* If you want to pass a single parameter WHICH IS AN ARRAY (eg as with `InserMany`), wrap your array in an outer array: `msg.payload` = `[[{_id: 1243}, {_id: 2345}]]`

Passing the last operation parameter (callbak) is not supported, and will be stripped if provided.


# Change Log
## 2.0
BREAKING CHANGES : driver response props are now (correctly) added to message.payload, thus chaning the response shape 
see https://github.com/ozomer/node-red-contrib-mongodb2/issues/34

`1.0` message shape: 
```
msg
|_  payload
     |_ ok
     |_ n
     |_ opTime
     |_ electionId     
     |_ operationTime
     |_ "$clusterTime
```
`2.0` message shape (example for `find()`): 
```
msg
|_  payload
     |_ insertedCount
     |_ ops
     |_ insertedIds      
     |_ result
            |_ ok
            |_ n
            |_ opTime
            |_ electionId
            |_ operationTime
            |_ "$clusterTime

```

## Original creation 1.0.0
MongoDB 3 driver is originally based on [MongoDB 2 driver node for Node-RED](https://www.npmjs.com/package/node-red-contrib-mongodb2), and therefore is placed in the same github repository: (https://github.com/ozomer/node-red-contrib-mongodb2)
The very-similar MongoDB 2 driver is in the same git repository, under the node-red-contrib-mongodb2 branch (not the master branch).

