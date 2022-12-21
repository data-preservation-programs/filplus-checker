/**
 * MIT License
 *
 * Copyright (c) [2018] [zbone3]
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const os = require('os'),
    log = console.log.bind(console),
    changeCase = require('change-case'),
    htmlEntities = require('html-entities').XmlEntities;

const DELIMITER = ':';

var stripHTMLEntitites = function(rawData){
    var entities = new htmlEntities();
    return entities.decode(rawData);
}

//Checks whether a delimiter followed by a space common in this result
var getCommonDelimiterForm = function(rawData, delimiter) {
    var delimiterPattern = new RegExp(delimiter + '\\S+', 'g');
    var delimiterWSpacePattern = new RegExp(delimiter + ' ', 'g');
    var delimiterMatches = rawData.match(delimiterPattern) || [];
    var delimiterWSpaceMatches = rawData.match(delimiterWSpacePattern) || [];

    if (delimiterMatches.length > delimiterWSpaceMatches.length) {
        return delimiter;
    }
    return delimiter + ' ';
}

var parseRawData = function(rawData) {

    var result = {};

    rawData = stripHTMLEntitites(rawData)
    rawData = rawData.replace(/:\s*\r\n/g, ': ');
    var lines = rawData.split('\n');
    var delimiter = getCommonDelimiterForm(rawData, DELIMITER);

    lines.forEach(function(line){

        line = line.trim();

        // colon space because that's the standard delimiter - not ':' as that's used in eg, http links
        if ( line && line.includes(delimiter) ) {
            var lineParts = line.split(DELIMITER);

            // 'Greater than' since lines often have more than one colon, eg values with URLs
            if ( lineParts.length >= 2 ) {
                var key = changeCase.camelCase(lineParts[0]),
                    value = lineParts.splice(1).join(DELIMITER).trim()

                // If multiple lines use the same key, combine the values
                if ( key in result ) {
                    result[key] = `${result[key]} ${value}`;
                    return
                }
                result[key] = value;
            }
        }
    });

    return result;
}

module.exports = parseRawData;
