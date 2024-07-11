# websocket-raw-client

Send arbitrary data to a RFC-4655 websocket for debugging and testing purposes.

## Description

THIS IS NOT A WEBSOCKET CLIENT. It is a testing utility that can be used to debug websocket connections.

- This tool was written to send arbitrary data to a websocket connection.
- There is no user interface. The intended use of the utility is to modify the code for each specific test, then run the modified script in Node.
- This is a native JavaScript application. There are no NPM dependencies and no external modules.
- This is a JavaScript program intended to run in NodeJs using command line terminal.
- The websocket connection handshake parameters are editable in the source code.
- The RFC-6455 websocket frame header values are parsed and displayed for inbound and outbound packets. 
- Data is shown in both hexadecimal and plain text.
- Both http/ws protocols and https/wss protocols (TLS) are supported.

## Motivation

I use a web based IRC web-client application that uses a websocket to
pass RFC-2812 IRC messages between a web based IRC web-client and a NodeJs
remote IRC client backend. The Chrome web browser includes a fully functional
websocket API. The backend Node application uses a standard NPM repository as a websocket server.

Recently I was applying some security updates due to security issues
located deep in the dependency tree of the websocket library 
that I was using on the backend server. 
Due to the security restrictions in the web browser and the limitations 
of the websocket API, it was not possible to test the websocket issue
from within my application.

Therefore, I decided to write a simple websocket client testing utility.
The functionality of the websocket testing was coded to test one specific issue
related to the security patches. The project was successful and I was 
able to reproduce the issue before the patch, then confirm that the patch fixed it.

When I was done, I started to explore more generally how a websocket functions. 
Using RFC-6455 as a guide, I extended my test utility.
As I explored further, I was able to establish an IRC
websocket connection directly with an IRC server. 
I found it interesting, so I decided to share it on GitHub.

## Server Not Included

It is assumed the user already has a websocket server that requires testing.
This README is limited to instruction for the operation of the websocket client (websocket-raw-client).
The server to which the requests are submitted is outside the scope of this README.md file.

## Installation

```bash
git clone git@github.com:cotarr/websocket-raw-client.git
cd websocket-raw-client
```

Do not run `npm install`. There are no NPM dependencies. The repository does not include a package.json file.

## Sequencer Description

This application uses a state machine to control the sequence of execution of various subroutines.
The `websocketConnectState` variable holds an integer value used to sequence each step.

List of websocketConnectState values

```
0 - Initialize state = 0 at program start
1 - Connecting TCP socket in progress
2 - TCP socket Connected
3 - HTTP upgrade request sent
4 - Successful websocket upgrade response
5 - Websocket connected
6 - Sending websocket protocol PING (opcode 0x09)
7 - Delay Timer
8 - Sending websocket ad-hoc content
9 - Delay timer
10 - Sending websocket data as fragments
11 - Delay timer
12 - Custom dynamic websocket response generator
13 - Delay Timer
14 - Send websocket protocol CLOSE command (opcode 0x08)
15 - Closing websocket, wait to exit program
```

## Example 1 - Configure to connect

This is a simple ad-hoc test program. The intent is to modify app.js 
for each test, and re-run the http client (`node app.js`) to view each new test.

The first step is to setup minimal configuration needed to connect the server.
The capabilities will be expanded in the next sections.

In the `app.js`, set the port, host, wsPath, wsOrigin, and tls=true/false.


```js
// Example options using a development server running on the local machine
let options = {
  port: 8000,
  host: 'localhost',
  wsPath: '/',
  wsOrigin: 'http://localhost',
  tls: false,
  verifyTlsHost: true
}
```

```js
// Example options using a remote server that requires TLS
let options = {
  port: 443,
  host: 'www.example.com',
  wsPath: '/',
  wsOrigin: 'https://www.example.com',
  tls: true,
  verifyTlsHost: true
}
```

In the `app.js`, review the array of stings containing the HTTP upgrade request.
This is a protocol change request, changing from http/https protocol to ws/wss protocol.
One final EOL '\r\n' will be appended automatically after all array elements have been sent.
The "secWebsocketKey" and it's expected response value are generated randomly for each connection.
This is a minimal set of headers. Additional headers may be added as necessary for cookies or tokens (See end of README.md)

```js
const httpOutputText = [
  'GET ' + options.wsPath + ' HTTP/1.1',
  'Host: ' + options.host + appendPortToHost,
  'Origin: ' + options.wsOrigin,
  'Connection: Upgrade',
  'Upgrade: websocket',
  'Sec-WebSocket-Key: ' + secWebsocketKey,
  'Sec-WebSocket-Version: 13'
];
```


Assuming the websocket protocol is accepted, the program will do the following:

- Open a new TCP socket to the web server.
- Send one HTTP request containing headers `Connection: Upgrade` and `Upgrade: websocket`
- The server is expected to return a response: `Status 101 Switching Protocols`
- The HTTP status 101 response is parsed for proper handshake values.
- The http/https connection is upgraded to a ws/wss websocket connection. 
- Incoming websocket messages are displayed realtime as they are received.

To run, type: `node app.js`

The websocket negotiation shown here will be omitted from the rest of the examples to save space.
Other examples will start with `websocketConnectState 4`.

Example output:

```
user1@laptop:~/dev/websocket-raw-client$ node app.js
websocketConnectState 0
websocketConnectState 1
Connect callback
Event: connect
websocketConnectState 2
Event: ready
Write:  GET / HTTP/1.1
Write:  Host: localhost:3003
Write:  Origin: http://localhost:3003
Write:  Connection: Upgrade
Write:  Upgrade: websocket
Write:  Sec-WebSocket-Key: b05OdEcyZURsMmtSQUd0cg==
Write:  Sec-WebSocket-Version: 13
Write:  Cookie: (Cookie not shown)
Close HTTP request by sending final EOL: \r\n

websocketConnectState 3
-------- HTTP Response --------
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: aI8qBeMQvDMAoA/WIxhdVgNsGVE=

 -------------------------------
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
websocketConnectState 99 (Auto-close disabled, waiting forever...)
```

In this case, the websocket handshake process was successful.
The websocket is connected. The application may be terminated
by entering Ctrl-C in the console terminal.

## Example 2 - Monitoring websocket messages from server

One of the servers being tested emits a "HEARTBEAT" message
every 10 seconds over the websocket connection.
When an event listener detectes inbound data with an incoming message, 
the message contents will be printed to the console.
This may interrupt the normal sequencer messages.
Websocket messages are displayed in 3 parts separated with dashed lines.

The first section will display the entire message in hexadecimal.
The hexadecimal data may be "masked". In the case of masked messages, 
each 8 bit byte of data is masked by applying an XOR operation
using a random 32 bit key included in the websocket frame header.
Messages from server to client are never masked.
Messages from client to server are always masked.

The second section shows the parsed values from either
inbound or outbound websocket frame header values.
These can be referenced in RFC-4655 Section 7.2.

The third section shows the websocket message data in plain text.
The extra blank line is due to end of line characters.
Note: this has not been tested with multi-byte international characters.

This example was run by typing `node app.js`.

Repeating HEARTBEAT messages will be received at 10 second intervals.
Note, inbound server messages are not masked.

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
websocketConnectState 99 (Auto-close disabled, waiting forever...)
------- In Hex --------
ef bf bd 0a 48 45 41 52 54 42 45 41 
------ In Frame -------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=false length=10(bytes)
----- In Message ------
HEARTBEAT

-----------------------
------- In Hex --------
ef bf bd 0a 48 45 41 52 54 42 45 41 
------ In Frame -------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=false length=10(bytes)
----- In Message ------
HEARTBEAT

-----------------------
```

## Example 3 - Configure the websocket to send an opcode=0x09 ping request (State 6)

Locate the following configuration variable in app.js and set the value to true.

```js
// websocketConnectState 6 Websocket opcode 0x09 ping example
const enableWebsocketPing = true;
```

Restart the application `node app.js`

The websocket ping request is sent using a frame header opcode=0x09.
The response contains opcode=0x0A in the websocket frame header.
In this case the outbound message has a header containing a
random generated 32 bit mask. However, no data is sent.

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
------- Out Hex -------
ef bf bd ef bf bd 
------ Out Frame ------
Header: opcode=0x09(ping) RSV=0x00 FIN=true MASK=true mask=[214,157,22,35] length=0(bytes)
----- Out Message -----

-----------------------
websocketConnectState 7
------- In Hex --------
ef bf 
------ In Frame -------
Header: opcode=0x0a(pong) RSV=0x00 FIN=true MASK=false length=0(bytes)
----- In Message ------

-----------------------
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
websocketConnectState 99 (Auto-close disabled, waiting forever...)
```

## Example 4 - send arbitrary data to the websocket. (State 8)

Locate the following configuration variable in app.js and set the value to true.

```js
// websocketConnectState 8 Message submission Example
const enableWebsocketMessageSubmission = true;
```
Locate the `websocketOutputText` array in app.js.
The string values in this array will be sent through the websocket connection at 10 millisecond intervals. 
In this case, EOL characters `\r\n` must entered explicitly as part of the string value.

```js
const websocketOutputText = [
  'Hello World (#1)\r\n',
  'Hello World (#2)\r\n',
  'Hello World (#3)\r\n'
];
```

When the program is run, each line of text will be shown in the console as it is sent.
In this case, the hexadecimal values are encoded using 8 bit XOR operations
using the mask key included in the header.

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
------- Out Hex -------
ef bf bd ef bf bd 4e 72 ef bf bd 2c 06 17 ef bf bd 40 21 52 ef bf bd 43 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=true mask=[78,114,226,44] length=18(bytes)
----- Out Message -----
Hello World (#1)

-----------------------
------- Out Hex -------
ef bf bd ef bf bd cd be 31 65 ef bf bd ef bf bd 5d 09 ef bf bd ef bf bd 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=true mask=[205,190,49,101] length=18(bytes)
----- Out Message -----
Hello World (#2)

-----------------------
------- Out Hex -------
ef bf bd ef bf bd 37 ef bf bd 31 ef bf bd 7f ef bf bd 5d ef bf bd 58 ef 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=true mask=[55,214,49,133] length=18(bytes)
----- Out Message -----
Hello World (#3)

-----------------------
websocketConnectState 9
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
websocketConnectState 99 (Auto-close disabled, waiting forever...)
```

The websocket server software is outside the scope of this example.
The response to these messages must be verified in accordance with the server application in use.
For the unique case of the server used here, the websocket messages were logged as follows:

```
Unexpected websocket message: Hello World (#1)
Unexpected websocket message: Hello World (#2)
Unexpected websocket message: Hello World (#3)
```
## Example 5 - Example of a fragmented message. (State 10)

Locate the following configuration variable in app.js and set the value to true.

```js
// websocketConnectState 10 Fragment Example
const enableWebsocketFragmentSubmission = true;
```

Locate the `websocketFragmentedOutputText` Array.
This array contains one fragmented message that is split into
two or more parts. They are marked as fragments during transmission.
Only one fragmented message in multiple parts is allowed in the array.

```js
const websocketFragmentedOutputText = [
  'This is the first part of the frag',
  'mented message, split bet',
  'ween several separate frames\r\n'
];
```

In this example, the header 'opcode' and the 'FIN' bit are used to control fragmentation.

- Header: `FIN=0 opcode=1` First fragment packet
- Header: `FIN=0 opcode=0` Middle packet(s)
- Header: `FIN=1 opcode=0` Last fragment packet

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
------- Out Hex -------
01 ef bf bd ef bf bd ef bf bd 64 12 ef bf bd ef bf bd 0d 61 ef bf bd ef bf bd 17 32 ef bf bd ef bf bd 01 32 ef bf bd ef 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=false(Fragment) MASK=true mask=[133,160,100,18] length=34(bytes)
----- Out Message -----
This is the first part of the frag
-----------------------
------- Out Hex -------
00 ef bf bd ef bf bd ef bf bd 6e ef bf bd df b3 1a ef bf bd ef bf bd ef bf bd 03 ef bf bd c9 
------ Out Frame ------
Header: opcode=0x00(continuation frame) RSV=0x00 FIN=false(Fragment) MASK=true mask=[234,186,221,110] length=25(bytes)
----- Out Message -----
mented message, split bet
-----------------------
------- Out Hex -------
ef bf bd ef bf bd 68 04 45 30 1f 61 20 5e 48 77 20 46 0d 76 24 5c 48 77 20 40 09 76 24 44 0d 24 23 42 09 69 
------ Out Frame ------
Header: opcode=0x00(continuation frame) RSV=0x00 FIN=true MASK=true mask=[104,4,69,48] length=30(bytes)
----- Out Message -----
ween several separate frames

-----------------------
websocketConnectState 11
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
websocketConnectState 99 (Auto-close disabled, waiting forever...)
```

The websocket server is outside the scope of this example.
For the unique case of the server used here, the re-assembled fragments were able to be logged as follows:

```
Unexpected websocket message: This is the first part of the fragmented message, split between several separate frames
```

## Example 5 - Example of dynamically generated responses. (State 12)

This dynamic response generator section will allow custom 
code to be written to parse inbound websocket packets, 
apply some custom logic, then dynamically generate the 
proper websocket response.

Locate the following configuration variable in app.js and set the value to true.

```js
// websocketConnectState 12 Dynamic Response Example
const enableCustomDynamicResponses = true;
```

In this example, the websocket-raw-client can be connected to an IRC server
which includes websocket compatibility. To test this utility,
a copy of the unrealIRCd IRC server was downloaded, compiled and 
installed as a stand alone IRC server for testing.

Two functions are used to handle the dynamic websocket example.
First, the function `customizeDynamicResponseInitialize()` will
contain custom JavaScript code that will send the initial websocket message.

The second function `customizeDynamicResponsesHandler(encodedWebsocketFrame)`
is called as an event handler for each websocket data event.
When the exchange of data is complete, variables are set to tell the 
sequencer to advance to the next state.

The example here is more complex than can be covered in this description.
Please look a these two functions and consider them as example code.
A high level description of the steps are described as follows:

Calling the first function will send the IRC nickname registration request. 
A JavaScript event listener  will call the second function 
when the expected PING request is received from the server.
The second function detects the ping request, extracts the random nonce,
then sends a PONG response to the websocket with extracted nonce appended.
It goes something like this:

```
NICK mynick
USER myuser 8 * :Real Name
PING:123456
PONG :123456
```
- Client sends IRC nickname registration commands `NICK mynick\r\nUSER myuser 8 * :Real Name\r\n`.
- Client Waits for the IRC server to send a `PING:123456` request. The ID string will be different.
- Client submits the IRC command `PONG :123456\r\n` to answer the ping request
- A timer is used to provide delay time to observe further messages.

The following example was performed using an isolated IRC server that is used only for testing. 
Running this on a live IRC network is not recommended and will likely get you banned.

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
Start custom dynamic response handler
------- Out Hex -------
ef bf bd ef bf bd ef bf bd 1a ef bf bd 29 ef bf bd 53 ef bf bd 62 ef bf bd 77 ef bf bd 47 ef bf bd 79 ef bf bd 24 ef bf bd 4f ef bf bd 6c ef 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=true mask=[154,26,155,41] length=41(bytes)
----- Out Message -----
NICK mynick
USER myuser 8 * :Real Name

-----------------------
------- In Hex --------
ef bf bd 0e 50 49 4e 47 20 3a 31 44 41 43 45 44 
------ In Frame -------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=false length=14(bytes)
----- In Message ------
PING :1DACED1A
-----------------------
------- Out Hex -------
ef bf bd ef bf bd ef bf bd 1c ef bf bd 28 ef bf bd 53 ef bf 
------ Out Frame ------
Header: opcode=0x01(text frame) RSV=0x00 FIN=true MASK=true mask=[153,28,170,40] length=14(bytes)
----- Out Message -----
PONG :1DACED1A
-----------------------
```

## Example 6 - Closing the websocket

Locate the following configuration variable in app.js and set the value to true.

```js
// websocketConnectState 14 Close websocket at end of sequence
const enableCloseSocketAtEnd = true;
```

When set to true, the websocket will be closed at the end of the sequence.
The opcode=0x08 in the websocket frame header is sent to the remote websocket server.

When set to false, the web socket will remain open to monitor
websocket data as it is received.

```
websocketConnectState 4 (Upgrade Response)
websocketConnectState 5 (Connected)
websocketConnectState 6 (Timer: 1 second)
websocketConnectState 7 (Ping submission disabled)
websocketConnectState 8 (Timer: 1 second)
websocketConnectState 9 (Message submission disabled)
websocketConnectState 10 (Timer: 1 second)
websocketConnectState 11 (Fragment submission disabled)
websocketConnectState 12 (Timer: 1 second)
websocketConnectState 13 (Dynamic responses disabled)
websocketConnectState 14 (Timer: 1 second)
------- Out Hex -------
ef bf bd ef bf bd 
------ Out Frame ------
Header: opcode=0x08(connection close) RSV=0x00 FIN=true MASK=true mask=[242,224,227,243] length=0(bytes)
----- Out Message -----

-----------------------
websocketConnectState 15
------- In Hex --------
ef bf 
------ In Frame -------
Header: opcode=0x08(connection close) RSV=0x00 FIN=true MASK=false length=0(bytes)
----- In Message ------

-----------------------
Event: socket.end
Event: socket.close, hadError=false destroyed=true
```

## Credentials from environment variables

Credentials such as a cookies and access tokens 
may be available as environment variables. 
These can be used within the http request using the 
process.env API available in nodejs.
This would avoid hard coded credentials.

Authorization headers will be created automatically when
unix environment variables COOKIE or TOKEN are found.
These can be crated from the CLI

```bash
export COOKIE=xxxxxxxxxx

export TOKEN=yyyyyyyyyy
```
This will automatically add the following headers:

```
Cookie: xxxxxxxxxx
Authorization: Bearer yyyyyyyyyy
```

Alternately, these can be added manually in the outputText Array.

```js
const outputText = [
  'GET ' + options.wsPath + ' HTTP/1.1',
  'Host: ' + options.host + appendPortToHost,
  'Origin: ' + options.wsOrigin,
  'Connection: Upgrade',
  'Upgrade: websocket',
  'Sec-WebSocket-Key: ' + secWebsocketKey,
  'Sec-WebSocket-Version: 13',
  'Cookie: www.example.com=' + process.env.COOKIE,
];
```

Reference access token from env variables

```js
const outputText = [
  'GET ' + options.wsPath + ' HTTP/1.1',
  'Host: ' + options.host + appendPortToHost,
  'Origin: ' + options.wsOrigin,
  'Connection: Upgrade',
  'Upgrade: websocket',
  'Sec-WebSocket-Key: ' + secWebsocketKey,
  'Sec-WebSocket-Version: 13',
  'Authorization: Bearer ' + process.env.TOKEN,
];
```