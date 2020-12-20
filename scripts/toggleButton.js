function openTab(evt, className) {
    var i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
      tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
      console.log(tablinks[i]);
      tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(className).style.display = "block";
    evt.currentTarget.className += " active";
    console.log(evt);
}

module.exports.openTab = openTab;