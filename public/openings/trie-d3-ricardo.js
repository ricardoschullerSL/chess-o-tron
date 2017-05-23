var width,height
var chartWidth, chartHeight
var margin
var svg = d3.select("#graph").append("svg")
var chartLayer = svg.append("g").classed("chartLayer", true)


function draw(graph) {
    var range = 100
    var data = graph; 
    console.log(data);
    setSize(data)
    drawChart(data)    
}

function setSize(data) {
    //width = document.querySelector("#graph").clientWidth
    //height = document.querySelector("#graph").clientHeight
    width = 800;
    height = 600;
    margin = {top:0, left:0, bottom:0, right:0 }
    
    
    chartWidth = width - (margin.left+margin.right)
    chartHeight = height - (margin.top+margin.bottom)
    
    svg.attr("width", width).attr("height", height)
    
    
    chartLayer
        .attr("width", chartWidth)
        .attr("height", chartHeight)
        .attr("transform", "translate("+[margin.left, margin.top]+")")
        
        
}

function drawChart(data) {
    
    var color = d3.scaleLinear()
    	.domain([0, 0.5, 1])
    	.range(["red", "grey", "lime"]);
         
    var simulation = d3.forceSimulation()
        .force("link", d3.forceLink().strength(2).id(function(d) { return d.index }))
        .force("collide",d3.forceCollide( function(d){return d.r + 8 }).iterations(16) )
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(chartWidth / 2, chartWidth / 2))
        .force("y", d3.forceY(0))
        .force("x", d3.forceX(0))

    var link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(data.links)
        .enter()
        .append("line")
        .attr("stroke", "black")
    
    var nodes = svg.append("g")
        .attr("class", "nodes")
        .selectAll("nodes")
        .data(data.nodes)
    
    var nodes_enter = nodes.enter()
        .append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)); 
            
    nodes_enter.append("path")
        .style("stroke", "black")
        .style("fill", function (d) {return color(d.score)})
        .attr("d", d3.symbol()
                    .size(function (d) {if (d.size) return d.size * 10
                                        else return 50})
                    .type(function (d) {
                        if (d.type === "circle") return d3.symbolCircle 
                        else if (d.type === "cross") return d3.symbolCross
                        else return d3.symbolDiamond })
        )
        
    nodes_enter.append("text")
        .attr("dy", ".35em")
        .text(function (d) {return d.id});


    var ticked = function() {
        link
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        nodes
            .attr("cx", function(d) { return d.x; })
            .attr("cy", function(d) { return d.y; });
        
        svg.selectAll("path")
            .attr("transform", function (d) {
                return "translate(" + d.x + ", " +d.y +")"
            })
        
        svg.selectAll("text")
            .attr("transform", function(d) {
                return "translate(" + d.x + ", " +d.y +")"
            })
    }  
    
     
    simulation
        .nodes(data.nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(data.links);    
    
    
    
    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }
    
    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    } 
            
}