# ioBroker.vbus-gw

![Logo](admin/vbus-gw.png)

[![NPM version](https://img.shields.io/npm/v/iobroker.vbus-gw.svg)](https://www.npmjs.com/package/iobroker.vbus-gw)
[![Downloads](https://img.shields.io/npm/dm/iobroker.vbus-gw.svg)](https://www.npmjs.com/package/iobroker.vbus-gw)
![Number of Installations](https://iobroker.live/badges/vbus-gw-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/vbus-gw-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.vbus-gw.png?downloads=true)](https://nodei.co/npm/iobroker.vbus-gw/)

**Tests:** ![Test and Release](https://github.com/pdbjjens/ioBroker.vbus-gw/workflows/Test%20and%20Release/badge.svg)

## vbus-gw adapter for ioBroker

Allows TCP access to serial port based VBus devices

This ioBroker Adapter is based on work by Daniel Wippermann.  
<https://github.com/danielwippermann/resol-vbus/tree/master/examples/serial-to-tcp>  
Copyright and license see section "License"

## Overview

There are two types of VBus hardware adapters:

- TCP based: DL2, DL3, KM2, VBus/LAN
- Serial port based: VBus/USB, USB port of DeltaSol SLT and other controllers  

This ioBroker adapter connects to one or more serial port based hardware adapters and exposes them over TCP. This allows:

- transmitting VBus data over longer distances than USB or serial ports would normally permit
- accessing serial port based adapters from applications that only support TCP based ones

## Configuration

Configurable items are:

- The TCP port on which the service is listening for incoming connections.  
Default is port: 7053, which should not be changed.
- A list of serial ports to connect to with the following parameters for each serial port:  

- channel: The vbus channel to which the serial port is assigned.  
If you only want to connect to a single serial port it is recommended to configure that to use channel 0, since most applications will by default try and connect that channel 0.
- path: The path to the serial port like '/dev/tty.usbmodem141301' or 'COM5'
- baudrate: The baudrate of the serial port. Default is 9600, which normally does not need to be changed.

## Known issues

- This adapter currently supports only one serial port.  
- Selecting a non-existing channel using the CHANNEL command returns +OK instead of an error.  
- Sending the DATA command with a non-existing channel selected returns +OK, but immediately closes the connection afterwards.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

- (pdbjjens) Fix: Disable SENTRY

### 0.0.2 (2023-09-21)

- (pdbjjens) initial release

## License

MIT License  
Copyright (c) 2023 Jens-Peter Jensen <jjensen@t-online.de>  
Copyright (c) 2013-present, Daniel Wippermann.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
