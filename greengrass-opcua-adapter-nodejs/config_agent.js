/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

require('requirish')._(module);
//requiring path and fs modules
const path = require('path');
const fs = require('fs');
const jsonFile = require('jsonfile');
const serverConfigfileName = 'published_nodes.json';
const clientConfigfileName = 'client_config.json';
const certConfigName = 'cert_config.json';
const systemStatus = 'system_status.txt';
const folder = '/etc/greengrass/opcua-adapter/config';

var readFailTolerance = 3;
var readFailTimes = 0;
var reportStatus = false;

var LastModifiedtime = "";

var ServerConfigs = [];

var ReServerConfigs = [];

var clientOptions = {
    keepSessionAlive: true,
    connectionStrategy: {
        maxRetry: 100000,
        initialDelay: 2000,
        maxDelay: 10 * 1000
    },
    checkServerConfigInterval: 1000
};

var certConfig = {
    certPath: ""
};

var timeout = 0;

function isEmptyOrWhitespace(value) {
    return (!value || !value.trim());
}

function isEmpty(value) {
    return (!value);
}

/**
 * @function configInit
 * @description This function is used to load regarding json files to configuration variable.
 * @param serverConfigs - opcua server configuration.
 * @param callback - this will be called after finishing loading json configuration,
 *                   the user can take use of loaded configuration to handle connection.
 */

function configInit(serverConfigs, callback) {
    jsonFile.readFile(`${folder}/${clientConfigfileName}`, function (err, configList) {
        if (err) {
            throw err;
        }
        for (let i = 0; i < configList.length; i += 1) {

            if (isEmptyOrWhitespace(configList[i].keepSessionAlive)) {
                throw new Error("configList[%d].keepSessionAlive is empty or whitespace", i);
            }

            if (!Number.isInteger(configList[i].connectionStrategy.maxRetry)) {
                throw new Error("configList[%d].connectionStrategy.maxRetry is not a number", i);
            }

            if (!Number.isInteger(configList[i].connectionStrategy.initialDelay)) {
                throw new Error("invalid .connectionStrategy.initialDelay is not a number");
            }

            if (!Number.isInteger(configList[i].connectionStrategy.maxDelay)) {
                throw new Error("connectionStrategy.maxDelay is not a number");
            }

            if (!Number.isInteger(configList[i].checkServerConfigInterval)) {
                throw new Error("connectionStrategy.maxDelay is not a number");
            }

            clientOptions.keepSessionAlive = configList[i].keepSessionAlive;
            clientOptions.connectionStrategy.maxRetry = configList[i].connectionStrategy.maxRetry;
            clientOptions.connectionStrategy.initialDelay = configList[i].connectionStrategy.initialDelay;
            clientOptions.connectionStrategy.maxDelay = configList[i].connectionStrategy.maxDelay;
            clientOptions.checkServerConfigInterval = configList[i].checkServerConfigInterval;
            readFailTolerance = configList[i].reportTolerance;
            reportStatus = configList[i].reportStatus;

            console.log(configInit.name + ":configList["+ i + "].keepSessionAlive: " + configList[i].keepSessionAlive);
            console.log(configInit.name + ":configList["+ i + "].connectionStrategy.maxRetry: " + configList[i].connectionStrategy.maxRetry);
            console.log(configInit.name + ":configList["+ i + "].connectionStrategy.initialDelay: " + configList[i].connectionStrategy.initialDelay);
            console.log(configInit.name + ":configList["+ i + "].connectionStrategy.maxDelay: " + configList[i].connectionStrategy.maxDelay);
            console.log(configInit.name + ":configList["+ i + "].checkServerConfigInterval: " + configList[i].checkServerConfigInterval);
        }
    });

    jsonFile.readFile(`${folder}/${certConfigName}`, function (err, configList) {
        if (err) {
            throw err;
        }

        if (isEmptyOrWhitespace(configList[0].certPath)) {
            throw new Error("configList[0].certPath is empty or whitespace");
        }

        certConfig.certPath = configList[0].certPath;

        console.log(configInit.name + ":configList[0].certPath: " + configList[0].certPath);

    });

    jsonFile.readFile(`${folder}/${serverConfigfileName}`, function (err, configList) {
        if (err) {
            throw err;
        }
        var stats = fs.statSync(`${folder}/${serverConfigfileName}`);
        var serverFileLastModifyTime = stats.mtime;

        configList["serInfo"].forEach((config)=> {
            if (isEmptyOrWhitespace(config.endpointName)) {
                console.log("invalid endpointName");
                return;
            }

            if (isEmptyOrWhitespace(config.endpointUrl)) {
                console.log("invalid endpointUrl");
                return;
            }

            if (config.OpcNodes.length <= 0) {
                console.log("No OpcNodes!");
                return;
            }
            var serverConfig = {
                server: {
                    name: "",
                    url: "",
                    certExist:false
                },
                userIdentity: null,
                subscriptions: [],
                connection: false
            };
            console.log(configInit.name + ": endpointName: " + config.endpointName);
            console.log(configInit.name + ": endpointUrl: " + config.endpointUrl);
            for (let j = 0; j < config.OpcNodes.length; j += 1) {
                serverConfig.subscriptions.push(config.OpcNodes[j]);
                console.log(configInit.name + " serverConfig.subscriptions.id: " + serverConfig.subscriptions[j].id);
                console.log(configInit.name + " serverConfig.subscriptions.displayName: " + serverConfig.subscriptions[j].displayName);
            }
            console.log(configInit.name + " serverConfig.subscriptions node length:" + serverConfig.subscriptions.length);
            serverConfig.server.url = config.endpointUrl;
            serverConfig.server.name = config.endpointName;

            // set default is certificate mode if user didn't set certExist in published_nodes.json
            if ( config.certExist ) {
                serverConfig.server.certExist = config.certExist
            } else {
                serverConfig.server.certExist = false
            }
            console.log(configInit.name + " serverConfig.server.certExist: " + serverConfig.server.certExist);
            serverConfig.server.userIdentity = config.userIdentity;
            serverConfigs.push(serverConfig);
            LastModifiedtime = serverFileLastModifyTime;
        });
        callback();
    });
}

function datesEqual(a, b) {
    return !(a > b || b > a);
}


/**
 * @function reportSystemStatus
 * @description This function is used to report the system status by writing time second into a file.
 */
function reportSystemStatus() {
    // overwrite system time to update system status
    var dateObject = new Date();
    var seconds = dateObject.getSeconds();
    fs.writeFile(`${folder}/${systemStatus}`, seconds, function (error) {
        if (error) {
            readFailTimes ++;
            console.log("Failed to write system time to " + folder + ": " + error + "times:" + readFailTimes);
        } else {
            console.log("System time written in " + folder + " successfully");
        }
    });
}

var compareWithTrustCert = function (serverCert) {
    // read file in the same folder
    var files = fs.readdirSync(certConfig.certPath);
    for (let file of files) {
        let contents = fs.readFileSync(`${certConfig.certPath}/${file}`);
        if (contents.length === serverCert.length) {
            if (contents.equals(serverCert)) {
                 return true;
            }
        }
    }
    return false;
};

function checkFileLoop(callback) {
    var obj = setInterval(()=> {
        clearInterval(obj);

        // check server file config file
        var stats = fs.statSync(`${folder}/${serverConfigfileName}`);
        var mtime = stats.mtime;

        /* update process running status if the feature is set and failure time less than readFailTolerance. */
        if ( reportStatus == "true" && readFailTimes < readFailTolerance )
        {
            reportSystemStatus();
        }

        // File modified due to different date
        if (!datesEqual(mtime, LastModifiedtime)) {
            LastModifiedtime = mtime;
            callback();
        }

        if (clientOptions.checkServerConfigInterval > 0) {
            timeout = clientOptions.checkServerConfigInterval;
        }
        checkFileLoop(callback);
    }, timeout);
}

module.exports.configInit = configInit;
module.exports.ServerConfigs = ServerConfigs;
module.exports.ReServerConfigs = ReServerConfigs;
module.exports.clientOptions = clientOptions;
module.exports.checkFileLoop = checkFileLoop;
module.exports.compareWithTrustCert = compareWithTrustCert;

