const fs = require('fs');
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('../Kayak-Simulation-DATA-236-Final-Project.pdf');

pdf(dataBuffer).then(function (data) {
    console.log(data.text);
}).catch(function (error) {
    console.error('Error parsing PDF:', error);
});
