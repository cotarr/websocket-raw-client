// websocket-raw-client, app.js
//
// ---------------------------------------------
//
//     THIS IS NOT A WEBSOCKET CLIENT.
// 
// It is a testing utility that can be used to debug websocket connections.
// ---------------------------------------------
//
// The configuration of this tool is hardcoded into this file.
// The JavaScript will require some modification prior to running the program. 
// The intended purpose is to do the following:
//
// - Open a new TCP socket to the web server.
// - Send one HTTP request containing headers `Connection: Upgrade` and `Upgrade: websocket`
// - The server is expected to return a response: `Status 101 Switching Protocols`
// - The HTTP status 101 response is parsed for proper handshake values.
// - The http/https connection is upgraded to a ws/wss websocket connection. 
// - Incoming websocket messages are displayed realtime as they are received.
//
// Before use, edit this file:
//
// Note: This is not interactive. It will run as a batch process.
//
// To Run: `node app.js`
//
// Response sent to stdout
// ------------------------------------------

'use strict';
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const process = require('process');

//
// Sequencer Configuration - Enable / Disable different tests
//

// websocketConnectState 6 Websocket opcode 0x09 ping example
const enableWebsocketPing = false
// websocketConnectState 8 Message submission Example
const enableWebsocketMessageSubmission = false;
// websocketConnectState 10 Fragment Example
const enableWebsocketFragmentSubmission = false;
// websocketConnectState 12 Dynamic Response Example
const enableCustomDynamicResponses = false;
// websocketConnectState 14 Close websocket at end of sequence
const enableCloseSocketAtEnd = false;

//
// Variables
//
let websocketConnectState = 0;
console.log('websocketConnectState', websocketConnectState);

// Timer: 10 * 100 = 1000ms --> 1 second
const sendIntervalMs = 10;
const wsWriteDelayLimit = 100;
let wsWriteDelayCount = 0;

let httpMessageIndex = 0;
let websocketMessageIndex = 0;
let fragmentMessageIndex = 0;
let fragmentState = 0;

let customDynamicResponsesActive = false;
let customDynamicResponseWatchdogCount = 0;
let customDynamicResponseWatchdogLimit = 0;

let socketConnected = false;
let socketError = false;

// --------------------------------
// Required: Modify as needed
// Address, port, wsPath, wsOrigin, tls=true/false
// --------------------------------
let options = {
  port: 8000,
  host: 'localhost',
  wsPath: '/',
  wsOrigin: 'http://localhost:8000',
  tls: false,
  verifyTlsHost: true
}

if (options.tls) {
  options.servername = options.host;
  options.rejectUnauthorized = options.verifyTlsHost;
  options.  minVersion = 'TLSv1.2';
}

// Optional: Case of self signed client certificate required by API
/*
if (options.tls) {
  options.key = fs.readFileSync('key.pem');
  options.cert = fs.readFileSync('cert.pem');
  options.ca = [ fs.readFileSync('ca.pem') ];
  options.checkServerIdentity = () => { return null; }; 
}
*/

let appendPortToHost = '';
if ((options.port !== 80) && (options.port !== 443))
appendPortToHost = ':' + options.port.toString();

//
// Authorization handshake values
//
// Handshake nonces from RFC-6455 The Websocket Protocol
// Request key is 16 random generated bytes, base 64 encoded
//
// Response is base64 encoded SHA-1 hash of the
// (base64 encoded key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
//
// Example key:
//    aUb6mO7FA7CHaLsi
// Example request:
//    Sec-WebSocket-Key: YVViNm1PN0ZBN0NIYUxzaQ==
// Example response:
//    Sec-WebSocket-Accept: 14MiFPaXo4OV/A+u+fcLHJOOPY4=
//
// Note: The random key generated here is intended for debugging. 
// A robust websocket client may use a more robust RNG with improved entropy.
const charSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let keyBytes = '';
for (let i = 0; i < 16; i++) {
  keyBytes += charSet.charAt(Math.floor(Math.random() * (charSet.length)));
}
const secWebsocketKey = Buffer.from(keyBytes).toString('base64');
const hash = crypto.createHash('sha1');
// Append fixed value from RFC-6455 section 5.2
hash.update(secWebsocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
const expectedResponseHash = hash.digest('base64');
// console.log(keyBytes, secWebsocketKey, expectedResponseHash);

// ----------------------------------------------
// HTTP request for protocol change from http/https to ws/wss
//
// Array of http header strings to be sent to the web server.
// The EOL `\r\n` is appended automatically
// ----------------------------------------------
const httpOutputText = [
  'GET ' + options.wsPath + ' HTTP/1.1',
  'Host: ' + options.host + appendPortToHost,
  'Origin: ' + options.wsOrigin,
  'Connection: Upgrade',
  'Upgrade: websocket',
  'Sec-WebSocket-Key: ' + secWebsocketKey,
  'Sec-WebSocket-Version: 13'
];
// Authorization headers from environment variables
if (process.env.COOKIE) {
  httpOutputText.push('Cookie: ' + process.env.COOKIE);
}
if (process.env.TOKEN) {
  httpOutputText.push('Authorization: Bearer ' + process.env.TOKEN);
}

// -----------------
// State 8 content
// -----------------
//
// Example ad-hc data string to be send to the websocket in State 8
//   End of line \r\n must be included here
//
const websocketOutputText = [
  'Hello World (#1)\r\n',
  'Hello World (#2)\r\n',
  'Hello World (#3)\r\n'
];

// // --------------------------------------
// // Loop to create large payload (Uncomment to add large strings)
// // 11   =   120 ----> 7 bit length in header
// // 6500 = 65010 ----> 16 bit length in header
// // 6600 = 66010 ----> 64 bit length in header
// // --------------------------------------
// const sizeTimes10 = 11;
// console.log('appending large string length: ' + (10 + (sizeTimes10 * 10)).toString());
// let largeString = '';
// for (let i = 0; i < sizeTimes10; i++) {
//   largeString += 'ABCDEFGHIJ'
// }
// largeString += '-----End\r\n';
// websocketOutputText.push(largeString);

// -----------------
// State 10 content
// -----------------
//
// Example one message to be sent to the websocket as multiple fragments to be reassembled.
// Only 1 fragment is supported, with array of 2 or more fragmented strings
// End of line `\r\n` must be included here as shown in the example.
//
const websocketFragmentedOutputText = [
  'This is the first part of the frag',
  'mented message, split bet',
  'ween several separate frames\r\n'
];

/**
 * Decode the RFC-6455 websocket frame header and extract data content
 * @param {Buffer} inData - Data from TCP socket, (frame header + data)
 * @returns {Object} Returns object with properties for decoded header data
 */
function _decodeWebsocketFrame (inData) {
  // Validate that NodeJs TCP socket data event passes stream data as type Buffer
  if (!Buffer.isBuffer(inData)) {
    throw new Error('Expect type Buffer');
  }

  // New object to be returned with parsed data as the object's properties.
  const frameData = {};

  // The text content of the Buffer may contain international multi-byte characters
  // For display purposes only, represent the TCP socket data as hexadecimal format
  const uint8String = new TextEncoder('utf8').encode(inData);
  let dataHexStr = '';
  for (let i = 0; i < inData.length; i++) {
    dataHexStr += uint8String[i].toString(16).padStart(2, '0') + ' ';
  }
  frameData.hex = dataHexStr;

  // Message data begins after frame header bytes
  // The frameHeaderLen will be modified during parsing of the header.
  frameData.frameHeaderLen = 2;

  // RFC-6455 header includes 4 bit opcode
  const opCode = (inData[0] & 0x0F);
  let opCodeInfo = '';
  switch (opCode) {
    case 0x00:
      opCodeInfo = '(continuation frame)'      
      break;
    case 0x01:
      opCodeInfo = '(text frame)'      
      break;
    case 0x02:
      opCodeInfo = '(binary frame)'      
      break;
    case 0x08:
      opCodeInfo = '(connection close)'      
      break;
    case 0x09:
      opCodeInfo = '(ping)'      
      break;
    case 0x0A:
      opCodeInfo = '(pong)'      
      break;
    default:
      break;
  }
  frameData.opCode = opCode;
  frameData.opCodeInfo = opCodeInfo;

  // RFC-6455 defines 3 bits reserved for extensions
  frameData.rsv3Bits = ((inData[0] >> 4) & 0x07);

  // RFC-6455 defines the FIN bit to indicate the current
  // data packet is a full message, not fragmented
  frameData.finFlag = (((inData[0] >> 7) & 1) === 1);

  // RFC-6455 defines payload length to be one of three cases,
  // 7 bits length for length 0 to 125 characters
  // 16 bits length for 126 to 65535 characters
  // 64 bits length for larger packets
  //
  // Therefore the frame header size will vary
  // depending on the size of the data block
  //
  // Case of 0 to 125 characters
  let payloadLength = (inData[1] & 0x7F)
  let extendedLengthBytes = 0;
  // Case of 126 to 65535 characters 16 bit length
  if (payloadLength === 0x7E) {
    frameData.frameHeaderLen += 2;
    extendedLengthBytes = 2;
    payloadLength = (
      (inData[2] << (1 * 8)) |
      (inData[3] << (0 * 8)));
  }
  // Case of greater than 65535 characters, 64 bit length
  else if (payloadLength === 0x7F) {
    frameData.frameHeaderLen += 8;
    extendedLengthBytes = 8;
    payloadLength = (
      (inData[2] << (7 * 8)) | 
      (inData[3] << (6 * 8)) | 
      (inData[4] << (5 * 8)) | 
      (inData[5] << (4 * 8)) | 
      (inData[6] << (3 * 8)) | 
      (inData[7] << (2 * 8)) | 
      (inData[8] << (1 * 8)) | 
      (inData[9] << (0 * 8)));
  }
  frameData.payloadLength = payloadLength;

  // Data sent from client to server over websocket
  // is masked using byte by byte XOR, using 
  // a 4 byte 32 bit mask included in the frame header.
  //
  // The MASK bit determines if the data is masked.
  // A masked header will be larger by 4 btyes to include the key.
  //
  // Inbound data from server to client is never masked.
  // Outbound data from client to server is always masked.
  //
  // Extract MASK bit (flag)
  const maskFlag = (((inData[1] >> 7) & 1) === 1);
  // Extract 4 byte key frame header
  // Offset will vary depending on size of length bytes
  let maskKey = Buffer.from([0, 0, 0, 0]);
  // Adjust offset for 32 bit mask
  if (maskFlag) {
    frameData.frameHeaderLen += 4;
    maskKey = Uint8Array.from([
      inData[2],
      inData[3],
      inData[4],
      inData[5]]);
    if (frameData.frameHeaderLen === 8) {
      maskKey = Uint8Array.from([
        inData[4],
        inData[5],
        inData[6],
        inData[7]]);      
    }
    if (frameData.frameHeaderLen === 14) {
      maskKey = Uint8Array.from([
        inData[10],
        inData[11],
        inData[12],
        inData[13]])
    }
  } // maskFlag
  frameData.maskFlag = maskFlag;
  frameData.maskKey = maskKey;

  // Separate frame header from frame data (Type Buffer)
  let messageBuffer = Buffer.from(inData.subarray(frameData.frameHeaderLen, inData.length));
  
  // Convert to 8 bit data to apply websocket mask using JavaScript type Uint8Array
  // Output XOR values will be places as number elements in an Array
  if ((frameData.maskFlag) && (messageBuffer.length > 0)) {
    let messageUint8Array = Uint8Array.from(messageBuffer);
    let maskIndex = 0;
    const maskedArray = [];
    for (let i = 0; i < messageUint8Array.length; i++) {
      maskedArray.push((messageUint8Array[i] ^ frameData.maskKey[maskIndex]) & 0xff);
      maskIndex++;
      if (maskIndex > 3) maskIndex = 0;
    }
    // Javascript type Array type Number elements converted back to 8 bit byte array
    messageUint8Array = Uint8Array.from(maskedArray);
    // Convert back to Buffer for string conversion
    messageBuffer = Buffer.from(messageUint8Array);
  }

  // Add the message part of the data packet to the output object
  frameData.messageUtf8 = messageBuffer.toString('utf8');
  
  // console.log(JSON.stringify(frameData, null, 2));
  return frameData;
} // _decodeWebsocketFrame ()


/**
 * Generate one random unsigned 8 bit byte
 * @returns {Number} Returns random unsigned 8 bit number
 */
function _random8bit () {
  // return 0; // For debug, to build 0x00000000 as 32 bit mask
  //
  // Return random 8 bit byte used to form 32 bit random mask key
  return (0xff & Math.floor(Math.random() * 256));
}

/**
 * Construct the RFC-6455 websocket frame header for outgoing text message
 * @param {Buffer|String} inMessage - Packet of stream data used to determine length in 8 bit bytes
 * @param {Boolean} frag - Optional flag to indicate iMessage is part of a fragmented packet 
 * @returns {Buffer} Returns Buffer containing 2 to 14 bytes websocket header + XOR masked data
 */
function _encodeWebsocketFrame (inMessage, frag) {
  // Setup for encoding of packet fragments
  // Optional argument 'frag' boolean, true if fragment
  //
  // Case of normal non-fragment packets
  //
  // frag = undefined/false fragmentState === 0 (Normal packet)    FIN=1 opcode=1
  //
  // Case of encoding fragmented packet.
  //
  // frag = true            fragmentState === 1 Start Packet       FIN=0 opcode=1
  // frag = true            fragmentState === 2 Middle (optional)  FIN=0 opcode=0
  // frag = undefined/false fragmentState === 3 Final Packet       FIN=1 opcode=0
  // ----------------------------------------------

  // Set global variable to remember fragment state across socket data events
  if (frag) {
    if (fragmentState === 0) {
      // First fragmented packet
      fragmentState = 1;
    } else if (fragmentState === 1) {
      // Middle packet
      fragmentState = 2;
    }
  } else {
    if (fragmentState > 0) {
      // Final fragment packet
      fragmentState = 3;
    }
  }
  // Websocket header FIN bit to identify fragments
  let notContinuationFrameBit = 1; 
  if ((fragmentState === 1) || (fragmentState === 2)) {
    notContinuationFrameBit = 0;
  }

  // For fragmented packets, websocket header opcode forced to zero for second through last packets
  let opcode = 0x01; // text frame (0x02 = binary frame)
  if ((fragmentState === 2) || (fragmentState === 3)) {
    opcode = 0x00; // Continuation frame
  }

  // Last, final, fragmented packet, clear flags. Expect next packet to be normal
  if (fragmentState === 3) {
    fragmentState = 0;
  }

  //
  // This Section will build the websocket header as described in
  // RFC-6455 Section 5.2
  //
  const maskedFrameBit = 1;
  const mask32 = Uint8Array.from([_random8bit(), _random8bit(), _random8bit(), _random8bit()]);

  // In order to perform 8 bit XOR operations with multi-byte wide international characters
  // convert the multi-byte text characters to 8 bit elements of JavaScript type Uint8Array
  let inMessageUint8Array = null;
  if (Buffer.isBuffer(inMessage)) {
    inMessageUint8Array = Uint8Array.from(inMessage);
  } else if (typeof inMessage === 'string') {
    inMessageUint8Array = Uint8Array.from(Buffer.from(inMessage));
  } else {
    throw new Error('_encodeWebsocketFrame expect type Buffer or String');
  }
  // console.log('inMessageUint8Array', inMessageUint8Array);

  // Mask the data bytes by applying binary bitwise XOR from websocket mask key
  // Results are temporary pushed to a Javascript array with elements type Number
  // then when the loop is complete, convert back to type Uint8Array
  let inMessageUint8MaskedArray = null;
  if (maskedFrameBit === 0) {
    inMessageUint8MaskedArray = inMessageUint8Array;
  } else {
    let maskIndex = 0;
    if (inMessageUint8Array.length > 0) {
      inMessageUint8MaskedArray = [];
      for (let i = 0; i < inMessageUint8Array.length; i++) {
        // data XOR mask
        inMessageUint8MaskedArray.push((inMessageUint8Array[i] ^ mask32[maskIndex]) & 0xff);
        // console.log(i, maskIndex, mask32[maskIndex], inMessageUint8Array[i], inMessageUint8MaskedArray[i]);
        maskIndex++;
        if (maskIndex > 3) maskIndex = 0;
      }
    } else {
      inMessageUint8MaskedArray = inMessageUint8Array;
    }
  }
  const maskedUint8Array = Uint8Array.from(inMessageUint8MaskedArray);
  // console.log('maskedUint8Array', maskedUint8Array)

  // Build the websocket frame header in sequence, byte by byte
  // The header is constructed using Javascript array with element of type Number,
  // then when complete, convert the array to type Uint8Array
  const headerArray = [];
  headerArray.push(((notContinuationFrameBit << 7) & 0x80) | (opcode & 0x0F));
  if (maskedUint8Array.length <= 125) {
    headerArray.push(((maskedFrameBit << 7) & 0x80) | (maskedUint8Array.length & 0x7F));
  } else if (maskedUint8Array.length <= 65535) {
    headerArray.push(((maskedFrameBit << 7) & 0x80) | (126 & 0x7F));
    headerArray.push((maskedUint8Array.length >> 8) & 0xff);
    headerArray.push((maskedUint8Array.length) & 0xff);
  } else if (maskedUint8Array.length > 65535) {
    headerArray.push(((maskedFrameBit << 7) & 0x80) | (127 & 0x7F));
    headerArray.push((maskedUint8Array.length >> 56) & 0xff);
    headerArray.push((maskedUint8Array.length >> 48) & 0xff);
    headerArray.push((maskedUint8Array.length >> 40) & 0xff);
    headerArray.push((maskedUint8Array.length >> 32) & 0xff);
    headerArray.push((maskedUint8Array.length >> 24) & 0xff);
    headerArray.push((maskedUint8Array.length >> 16) & 0xff);
    headerArray.push((maskedUint8Array.length >> 8) & 0xff);
    headerArray.push((maskedUint8Array.length) & 0xff);
  }
  if (maskedFrameBit) {
    headerArray.push(mask32[0]);
    headerArray.push(mask32[1]);
    headerArray.push(mask32[2]);
    headerArray.push(mask32[3]);
  }
  const uint8Header = Uint8Array.from(headerArray);
  // console.log('uint8Header', uint8Header);

  // To stay consistent, data received from TCP socket and sent to TCP socket is NodeJs type Buffer
  const outBuffer = Buffer.concat([uint8Header, maskedUint8Array], (uint8Header.length + maskedUint8Array.length));
  return outBuffer;
} // _encodeWebsocketFrame ()

/**
 * Construct the RFC-6455 websocket frame header for websocket opcode command (no data)
 * @param {Number} command 
 * @returns {Buffer} Returns buffer containing 2 to 14 byte header without data
 */
function _encodeCommandFrame (command) {
  // 8 = close, 9 = ping, 10 = pong, else error
  if ((command === 0x08) || (command === 0x09) || (command === 0x0a)) {
    // Client configuration
    const notContinuationFrameBit = 1; 
    const opcode = command; // text frame (0x02 = binary frame)
    const maskedFrameBit = 1;
    const payloadLength = 0;
    const mask32 = Uint8Array.from([_random8bit(), _random8bit(), _random8bit(), _random8bit()]);
    // Build frame header
    const headerArray = [];
    headerArray.push(((notContinuationFrameBit << 7) & 0x80) | (opcode & 0x0F));
    headerArray.push(((maskedFrameBit << 7) & 0x80) | (payloadLength & 0x7F));
    if (maskedFrameBit) {
      headerArray.push(mask32[0]);
      headerArray.push(mask32[1]);
      headerArray.push(mask32[2]);
      headerArray.push(mask32[3]);
    }
      // Return as NodeJs type Buffer
    const outBuffer = Buffer.from(headerArray);
    return outBuffer;
  } else {
    throw new Error('Error, invalid websocket opcode');
  }
} // _encodeCommandFrame()

/**
 * Build a one line text string showing decoded frame parameters
 * @param {Object} decoded - Object where properties are decoded header values
 * @returns {String} Returns printable one line string
 */
function _buildPrintableFrameStr (decoded) {
  let decodedStr = 'Header:';
  decodedStr += ' opcode=0x' + decoded.opCode.toString(16).padStart(2, '0') + decoded.opCodeInfo;
  decodedStr += ' RSV=0x' + decoded.rsv3Bits.toString(16).padStart(2, '0');
  decodedStr += ' FIN=' + decoded.finFlag;
  if (!decoded.finFlag) decodedStr += '(Fragment)';
  decodedStr += ' MASK=' + decoded.maskFlag;
  if (decoded.maskFlag) {
    decodedStr += ' mask=' + JSON.stringify(Array.from(decoded.maskKey));
  }
  decodedStr += ' length=' + decoded.payloadLength + '(bytes)';
  return decodedStr;
}

/**
 * Print to console outgoing websocket packet in Hex, decoded header, and string content
 * @param {Buffer} encodedWebsocketFrame - Includes frame header + frame content
 */
function printOutFrame (encodedWebsocketFrame) {
  const outDataObj = _decodeWebsocketFrame(encodedWebsocketFrame);
  console.log('------- Out Hex -------');
  console.log(outDataObj.hex);
  console.log('------ Out Frame ------');
  console.log(_buildPrintableFrameStr(outDataObj));
  console.log('----- Out Message -----');
  console.log(outDataObj.messageUtf8);
  console.log('-----------------------');
}

/**
 * Print to console incoming websocket packet in Hex, decoded header, and string content
 * @param {Buffer} encodedWebsocketFrame - Includes frame header + frame content
 */
function printInFrame (encodedWebsocketFrame) {
  const inDataObj = _decodeWebsocketFrame(encodedWebsocketFrame);
  console.log('------- In Hex --------');
  console.log(inDataObj.hex);
  console.log('------ In Frame -------');
  console.log(_buildPrintableFrameStr(inDataObj));
  console.log('----- In Message ------');
  console.log(inDataObj.messageUtf8);
  console.log('-----------------------');
}

// ---------------------
// State 12 Custom Code
// ---------------------
//
// THis section is an example using dynamic websocket responses
//
// In this example, the web socket can be connected to an IRC server
// which includes websocket compatibility. In this case unrealIRCd
// was downloaded, compiled and installed as a stand alone IRC 
// server for testing.
//
// IRC servers will periodically issue a PING requests to the IRC client.
//
// In this example, the client will issue an IRC nickname registration request.
// It will then wait for inbound "PING" request. 
// If PING is received, a PONG is sent to the websocket with the correct nonce.
// 
// IRC client command:    "NICK mynick"
// IRC client command:    "USER myuser 8 * :Real Name"
// IRC server request:    "PING :123456" where 123456 is random nonce.
// IRC client response:   "PONG :123456" where extracted nonce is appended.
//

/**
 * Function to initialize an example dynamic websocket exchange
 * to a demonstration IRC server that support websocket.
 */
function customizeDynamicResponseInitialize () {
  if (!enableCustomDynamicResponses) return;
  console.log('Start custom dynamic response handler');
  // Time duration is (count * sendIntervalMs) in milliseconds
  customDynamicResponseWatchdogLimit = 1000; // 10 seconds
  //
  // ----------------- Custom code goes here --------------------
  //
  // Case of IRC server requires a server password to register a nickname
  let ircConnectPassCommand = '';
  if (process.env.IRCDPASS) ircConnectPassCommand = 'PASS ' + process.env.IRCDPASS + '\r\n';
  // Send the IRC nickname registration commands over the websocket
  const encodedFrame = _encodeWebsocketFrame(ircConnectPassCommand +
    'NICK mynick\r\nUSER myuser 8 * :Real Name\r\n');
  socket.write(encodedFrame);
  printOutFrame(encodedFrame)
  //
  // --------------------------- End ----------------------------
} // customizeDynamicResponseInitialize()

/**
 * Websocket message handler used to demonstrate dynamically generated message responses
 * @param {Buffer} encodedWebsocketFrame - Server websocket message for parsing
 */
function customizeDynamicResponsesHandler (encodedWebsocketFrame) {
  // Check if disabled
  if (!enableCustomDynamicResponses) return;
  if (!customDynamicResponsesActive) return;

  // Decode raw websocket frame
  const inDataObj = _decodeWebsocketFrame(encodedWebsocketFrame);
  //
  // ----------------- Custom code goes here --------------------
  //
  if (inDataObj.messageUtf8.split(' ')[0] === 'PING') {
    let encodedOutFrame;
    encodedOutFrame = _encodeWebsocketFrame('PONG ' + inDataObj.messageUtf8.split(' ')[1]);
    socket.write(encodedOutFrame);
    printOutFrame(encodedOutFrame) ;
    // Timer
    const exitStateAfterMilliseconds = 5000; // 5 seconds
    setTimeout(() => {
      // Custom response has occurred, wait for further messages, then continue
      customDynamicResponsesActive = false;
      if (websocketConnectState === 12) {
        console.log('Custom responses complete, advancing state.')
        websocketConnectState = 13;
        console.log('websocketConnectState', websocketConnectState);
      }
    }, exitStateAfterMilliseconds);
  }// Ping Request
  //
  // --------------------------- End ----------------------------
} // customizeDynamicResponsesHandler()

// ------------------------------------------------
// Code to open TCP socket and receive data events
// ------------------------------------------------

let socket = null;

// Connect TCP socket
websocketConnectState = 1;
console.log('websocketConnectState', websocketConnectState);
if (options.tls) {
  socket = tls.connect(options, () => {
    console.log('tls.Connect callback');
  });
} else {
  socket = net.connect(options, () => { 
    console.log('Connect callback');
  });
}

socket.on('secureConnect', () => {
  console.log('Event: secureConnect');
  console.log('socket.authorized ', socket.authorized);
  if (socket.authorizationError) {
    console.log('socket.authorizationError ', socket.authorizationError);
  }
  if (options.tls) {
    socketConnected = true;
    websocketConnectState = 2;
    console.log('websocketConnectState', websocketConnectState);
  }
});

socket.on('connect', () => {
  console.log('Event: connect');
  if (!options.tls) {
    socketConnected = true;
    websocketConnectState = 2;
    console.log('websocketConnectState', websocketConnectState);
  }
});

socket.on('ready', () => {
  console.log('Event: ready');
});

//
// This is the main event handler for socket data events
//
// Prior to upgrade from HTTP request to websocket,
// this handler will parse HTTP upgrade response.
//
// After connection upgrade to websocket,
// Parse messages arriving through the websocket
//
let dataNoticePrinted = false;
socket.on('data', (data) => {
  //
  // Case 1 of 2 - HTTP response processing
  //
  if (websocketConnectState <= 3) {
    if (!dataNoticePrinted) {
      dataNoticePrinted = true;
      console.log('-------- HTTP Response --------');
    }

    // Not console.log() so \r\n can be true EOL characters
    const dataStr = data.toString('utf-8');

    if ((dataStr.indexOf(' 101 ') >= 0) &&
      (dataStr.indexOf('Upgrade: websocket') >= 0) &&
      (dataStr.indexOf('Connection: Upgrade') >= 0) &&
      (dataStr.indexOf('Sec-WebSocket-Accept') >= 0) &&
      (dataStr.indexOf(expectedResponseHash) >= 0)) {
      process.stdout.write(dataStr);
      console.log('\n -------------------------------');
      // Set sequencer to websocket upgrade response received.
      websocketConnectState = 4;
      console.log('websocketConnectState', websocketConnectState, '(Upgrade Response)');
    } else {
      process.stdout.write(dataStr);
      console.error('Websocket handshake failed.');
      socket.destroy();
      process.exit(1);
    }

  //
  // Case 2 of 2 - Websocket messages data packet events
  //
  } else if (websocketConnectState > 3) {
    // Handle TCP socket data as connected Websocket frame
    printInFrame(data);
    // Case of dynamic content handler
    // Send incoming packet to the handler to generate responses dynamically
    if (customDynamicResponsesActive) {
      customizeDynamicResponsesHandler(data);
    }
  }
});

socket.on('timeout', () => {
  console.log('Event: socket.timeout');
  socketError = true;
})

socket.on('end', () => {
  console.log('Event: socket.end');
});

socket.on('close', (hadError) => {
  console.log('Event: socket.close, hadError=' + hadError +
  ' destroyed=' + socket.destroyed);
  socketConnected = false;
  process.exit(0);
});

socket.on('error', (err) => {
  if (err) {
    console.log('Event: socket.error ' + err.toString());
    socketConnected = false;
    socketError = true;
  }
});

// ---------------------------
//    Main State Machine
// ---------------------------
//
// List of websocketConnectState values
//
// 0 - Initialize state = 0 at program start
// 1 - Connecting TCP socket in progress
// 2 - TCP socket Connected
// 3 - HTTP upgrade request sent
// 4 - Successful websocket upgrade response
// 5 - Websocket connected
// 6 - Sending websocket protocol PING (opcode 0x09)
// 7 - Delay Timer
// 8 - Sending websocket ad-hoc content
// 9 - Delay timer
// 10 - Sending websocket data as fragments
// 11 - Delay timer
// 12 - Custom dynamic websocket response generator
// 13 - Delay Timer
// 14 - Send websocket protocol CLOSE command (opcode 0x08)
// 15 - Closing websocket, wait to exit program
//
function timerHandler () {
  if (socketError) {
    process.exit(0);
  }
  if (socketConnected) {
    //
    // 2 - TCP socket Connected
    if (websocketConnectState === 2) {
      // Send each string to the web server, building request until empty line terminates
      if (httpMessageIndex < httpOutputText.length) {
        console.log('Write: ', httpOutputText[httpMessageIndex]);
        socket.write(httpOutputText[httpMessageIndex] + '\r\n');
      }
      httpMessageIndex++;
      // End of input, send empty string and advance state
      if (httpMessageIndex === httpOutputText.length) {
        console.log('Close HTTP request by sending final EOL: \\r\\n\n');
        socket.write('\r\n');
        websocketConnectState = 3;
        console.log('websocketConnectState', websocketConnectState);
      }

    // 3 - The 'connect' is handled by 'data' events on the socket event listener

    // 4 - Successful websocket upgrade response
    } else if (websocketConnectState === 4) {
      wsWriteDelayCount = 0;
      websocketConnectState = 5;
      console.log('websocketConnectState', websocketConnectState, '(Connected)');

    // 5 Delay timer
    } else if (websocketConnectState === 5) {
      wsWriteDelayCount++;
      if (wsWriteDelayCount >= wsWriteDelayLimit) {
        wsWriteDelayCount = 0;
        websocketConnectState = 6;
        console.log('websocketConnectState', websocketConnectState, '(Timer: 1 second)');
      }

    // 6 - Sending websocket protocol PING (opcode 0x09)
    } else if (websocketConnectState === 6) {
      if (enableWebsocketPing) {
        const pingOpcode = 0x09;
        const commandFrame = _encodeCommandFrame(pingOpcode);
        printOutFrame(commandFrame)
        socket.write(commandFrame)
        websocketConnectState = 7;
        console.log('websocketConnectState', websocketConnectState);
      } else {
        websocketConnectState = 7;
        console.log('websocketConnectState', websocketConnectState, '(Ping submission disabled)');
      }

    // 7 - Delay timer
    } else if (websocketConnectState === 7) {
      wsWriteDelayCount++;
      if (wsWriteDelayCount >= wsWriteDelayLimit) {
        wsWriteDelayCount = 0;
        websocketConnectState = 8;
        console.log('websocketConnectState', websocketConnectState, '(Timer: 1 second)');
      }

      // 8 - Sending websocket ad-hoc content, end of line EOL characters must be in array data
    } else if (websocketConnectState === 8) {
      if (enableWebsocketMessageSubmission) {
        if (websocketMessageIndex < websocketOutputText.length) {
          const encodedFrame = 
            _encodeWebsocketFrame(websocketOutputText[websocketMessageIndex]);
          socket.write(encodedFrame);
          printOutFrame(encodedFrame)
        } else {
          wsWriteDelayCount = 0;
          websocketConnectState = 9;
          console.log('websocketConnectState', websocketConnectState);
        }
        websocketMessageIndex++
      } else {
        wsWriteDelayCount = 0;
        websocketConnectState = 9;
        console.log('websocketConnectState', websocketConnectState, '(Message submission disabled)');        
      }

    // 9 - Delay timer
    } else if (websocketConnectState === 9) {
      wsWriteDelayCount++;
      if (wsWriteDelayCount >= wsWriteDelayLimit) {
        wsWriteDelayCount = 0;

        websocketConnectState = 10;
        console.log('websocketConnectState', websocketConnectState, '(Timer: 1 second)');
      }

    // 10 - Sending websocket content as fragments
    } else if (websocketConnectState === 10) {
      if (enableWebsocketFragmentSubmission) {
        if (fragmentMessageIndex < websocketFragmentedOutputText.length) {
          // Case of Fragment, FIN=0, append Boolean argument set to true to identify fragment.
          // This is better explained in comments above in _encodeWebSocketFrame()
          let encodedFrame = 
            _encodeWebsocketFrame(websocketFragmentedOutputText[fragmentMessageIndex], true);
          // Case of final packet, FIN=1
          if (fragmentMessageIndex >= websocketFragmentedOutputText.length - 1) {
            encodedFrame = 
              _encodeWebsocketFrame(websocketFragmentedOutputText[fragmentMessageIndex]);
          }
          socket.write(encodedFrame);          
          printOutFrame(encodedFrame)
        } else {
          wsWriteDelayCount = 0;
          websocketConnectState = 11;
          console.log('websocketConnectState', websocketConnectState);
        }
        fragmentMessageIndex++
      } else {
        wsWriteDelayCount = 0;
        websocketConnectState = 11;
        console.log('websocketConnectState', websocketConnectState, '(Fragment submission disabled)');
      }


    // 11 - Delay timer
  } else if (websocketConnectState === 11) {
    wsWriteDelayCount++;
    if (wsWriteDelayCount >= wsWriteDelayLimit) {
      wsWriteDelayCount = 0;
      websocketConnectState = 12;
      console.log('websocketConnectState', websocketConnectState, '(Timer: 1 second)');
    }

  // 12 - Custom dynamic websocket response, pass to dynamic response generator
  } else if (websocketConnectState === 12) {
    if (enableCustomDynamicResponses) {
      if (!customDynamicResponsesActive) {
        customDynamicResponsesActive = true;
        customizeDynamicResponseInitialize();
      } else {
        customDynamicResponseWatchdogCount++;
        // Time duration is (count * sendIntervalMs) in milliseconds
        if (customDynamicResponseWatchdogCount > customDynamicResponseWatchdogLimit) {
          console.log('Dynamic response watchdog timer expired. Advancing state.');
          wsWriteDelayCount = 0;
          websocketConnectState = 13;
          console.log('websocketConnectState', websocketConnectState);
        }
      }
    } else {
      wsWriteDelayCount = 0;
      websocketConnectState = 13;
      console.log('websocketConnectState', websocketConnectState, '(Dynamic responses disabled)');      
    }

  // 13 - Delay timer
  } else if (websocketConnectState === 13) {
      wsWriteDelayCount++;
      const endOfSequenceExitDelay = wsWriteDelayLimit // cycles
      if (wsWriteDelayCount >= endOfSequenceExitDelay) {
        wsWriteDelayCount = 0;
        websocketConnectState = 14;
        console.log('websocketConnectState', websocketConnectState, '(Timer: 1 second)');
      }

    // 14 - Send websocket protocol CLOSE (opcode 0x08)
    } else if (websocketConnectState === 14) {
      if (enableCloseSocketAtEnd) {
        const closeOpcode = 0x08;
        const commandFrame = _encodeCommandFrame(closeOpcode);
        printOutFrame(commandFrame)
        socket.write(commandFrame)
        websocketConnectState = 15;
        console.log('websocketConnectState', websocketConnectState);
      } else {
        websocketConnectState = 99;  
        console.log('websocketConnectState', websocketConnectState, '(Auto-close disabled, waiting forever...)');
      }

    // 15 - Set watchdog timer, then Wait for socket to close
    } else if (websocketConnectState === 15) {
      websocketConnectState = 99;
      console.log('websocketConnectState', websocketConnectState, '(Timer: 5 seconds)');
      setTimeout(function() {
        console.log('Sequencer reached end. Destroying TCP socket');
        console.log('\n');
        socket.destroy();
        process.exit(0);
      }, 5000);
    }
  }
}
setInterval(timerHandler, sendIntervalMs);
