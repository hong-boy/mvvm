var str = '<option v-for="city in cityList" :value="city.val">{{{city.label}}}</option>';
/*
 var tempArr = [];
 for(var city in cityList){
 tempArr.push(
 '<option value="'+(city.val)+'">'+(city.label)+'</option>'
 );
 }
 return tempArr.join('\n');
 */

var regx1 = /\{\{\{(.*)\}\}\}/;
var regx2 = /(.*?)\s+(?:in)\s+(.*)/;
var regx3 = /(v-for="(.*)")/;

function init(){
    var cityList = [
        {label:'test label', val:22}
    ];
    var inMatches = str.match(regx2);
    var fnBody = [];
    fnBody.push('var tempArr = [];');
    var strRegx = str.replace(regx1, function(matchstr, matchvalue){
        return "'+("+(matchvalue)+")+'";
    });
    strRegx = "'"+strRegx+"'";
    strRegx = "return " + strRegx;
    var fn = new Function('city', strRegx);
    console.log(fn(cityList[0]));
}

init();