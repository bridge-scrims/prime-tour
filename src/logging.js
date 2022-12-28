const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const path = require('path');
const util = require('util');
const fs = require('fs'); 

const LOGGING_PATH = path.join("logs")
const MAX_LOGS = 10

function stringifyDate(date) {
    const month = (date.getUTCMonth()+1).toString().padStart(2, '0')
    const day = date.getUTCDate().toString().padStart(2, '0')
    return `${date.getUTCFullYear()}${month}${day}`
}
       
async function removeOld() {
    const files = await fs.promises.readdir(LOGGING_PATH).catch(() => null)
    if (!files) return false;

    const logs = files
        .filter(file => file.endsWith('.log'))
        .map(file => file.slice(0, -4))
        .sort((name1, name2) => name2 - name1)

    while (logs.length > MAX_LOGS) {
        const oldFile = logs.pop()
        await fs.promises.rm(path.join(LOGGING_PATH, `${oldFile}.log`))
    }
}

function getTime() {
    const date = new Date()
    return `[${date.toISOString()}]`;
}

const log = console.log
const error = console.error
const warn = console.warn

async function rotateLog() {
    const logFile = fs.createWriteStream(path.join(LOGGING_PATH, `${stringifyDate(new Date())}.log`), { flags: 'a' });
    
    console.log = ((...d) => {
        log.apply(console, [getTime()].concat(d))
        logFile.write(getTime() + " " + util.format(...d) + '\n');
    })

    console.error = ((...d) => {
        error.apply(console, [getTime()].concat(d))
        logFile.write(getTime() + " " + util.format(...d) + '\n');
    })

    console.warn = ((...d) => {
        warn.apply(console, [getTime()].concat(d))
        logFile.write(getTime() + " " + util.format(...d) + '\n');
    })

    logFile.write("------- Log Start -------\n");
    await removeOld()
}
    

async function rotateLater() {
    const midNight = new Date(Date.now() + 86400000)
    midNight.setUTCHours(0, 0, 0, 0)

    await sleep(midNight.getTime() - Date.now())

    await rotateLog().catch(console.error)
    await rotateLater().catch(console.error)
}
    
async function setup() {
    if (!fs.existsSync(LOGGING_PATH)) fs.mkdirSync(LOGGING_PATH)
    await rotateLog().catch(console.error)
    rotateLater().catch(console.error)
}

module.exports = setup;

