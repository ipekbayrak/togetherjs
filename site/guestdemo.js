let videoengager = (function () {
    let displayName, firstName, lastName, organizationId, deploymentId, 
    veUrl, tenantId, environment, queueName, video_on = false,
    clickButtonStartLabel = 'Start video', clickButtonStopLabel = 'Stop video', 
    videoIframeHolderName = 'video-iframe-holder',
    afterGenerateInteractionDataCallback = null,
    startButtonPressed = null, 
    onError = null,
    cleanUpVideoHolder = true;

    const returnExtendedResponses = false;
    const enableDebugLogging = false;
    
    let chatId;
    let memberId;
    let jwt;
    let interactionId;
    let coBrowseURL;

    const platformClient = require_g("platformClient");
    const client = platformClient.ApiClient.instance;

    /**
     * Configures purecloud's sdk (enables debugging, sets correct environment)
     * @param {string} client platformClient.ApiClient.instance
     * @param {string} environment purecloud environment. Example: mypurecloud.com
     * @param {boolean} returnExtendedResponses
     * @param {boolean} enableDebugLogging
     */
    const configureSDK = function (client, environment, returnExtendedResponses, enableDebugLogging) {
        client.setEnvironment(environment);
        client.setReturnExtendedResponses(returnExtendedResponses);

        if (enableDebugLogging) {
            client.setDebugLog(console.log);
        }
    };

    /**
     * Generates random GUID string
     * @returns {string} GUID
     */
    const getGuid = function() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        return (s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4());
    };

    /**
     * Gets cookie value
     * @param {string} name cookie name
     * @returns {string|null} cookie value or undentified if cookie doesnt exists
     */
    const getCookie = function(name) {
        var pattern = new RegExp(name + "=.[^;]*");
        var matched = document.cookie.match(pattern);
        if (matched) {
            var cookie = matched[0].split("=");
            var cooki = decodeURIComponent(cookie[1]).replace(
                /"/g,
                ""
            );
            return cooki;
        }
        return null;
    };

    /**
     * Creates cookie with value and expiration time in hours
     * @param {string} name
     * @param {string} value
     * @param {number} hour time to live in hours
     */
    const setCookie = function(name, value, hour) {
        var cookieName = name;
        var cookieValue = value;
        var d = new Date();
        var time = d.getTime();
        var expireTime = time + 1000 * 60 * 60 * parseInt(hour);
        d.setTime(expireTime);
        if (hour) {
            document.cookie =
                cookieName +
                "=" +
                cookieValue +
                ";expires=" +
                d.toGMTString() +
                ";path=/";
        } else {
            document.cookie =
                cookieName + "=" + cookieValue + ";path=/";
        }
    };

    /**
     * Load videoengager ui
     * @param {string} veUrl
     * @param {string} interactionId
     * @param {string} tenantId
     */
    const loadUI = function (veUrl, tenantId) {
        let str = {
            video_on: video_on,
            sessionId: interactionId,
            hideChat: true,
            type: "initial",
            defaultGroup: "floor",
            view_widget: "4",
            offline: true,
            aa: true,
            inichat: "false"
        };
        let encodedString = window.btoa(JSON.stringify(str));
        while (veUrl.charAt(veUrl.length-1) === "/"){
            veUrl = veUrl.substring(0,veUrl.length-1)
        }
        let url = `${veUrl}/static/popup.html?tennantId=${window.btoa(tenantId)}&params=${encodedString}`;
        $(`#${videoIframeHolderName}`).html(`<iframe width="100%" height="100%" id="videoengageriframe" allow="microphone; camera" src="${url}"></iframe>`);
    };

    const sendCoBrowseURL = function(url) {
        var postData = {
            //[Check out the Resource Center!](https://help.mypurecloud.com)  
            body: "[Click Here to CoBrowse](" + coBrowseURL + ")"
        }
        $.ajax({
            url: `https://api.${environment}/api/v2/webchat/guest/conversations/${chatId}/members/${memberId}/messages`,
            type: "POST",
            data: JSON.stringify(postData),
            contentType: "application/json",
            beforeSend: function(xhr) {
                xhr.setRequestHeader( "Authorization", "bearer " + jwt );
            },
            success: function(data, statusCode, jqXHR) {
                var errorData = { message: "successfully sent url to remote chat", statusCode: statusCode, in_function: "sendCoBrowseURL" };
                onError(errorData);
            },
            error: function(err) {
                var errorData = { message: "Status Text: " + err.statusText + " Request Status Code: " + err.status, error_class: "COMMUN_ERROR", in_function: "sendCoBrowseURL" };
                onError(errorData);
            }
        });
    }

    /**
     * Sends interaction id
     * @param chatId
     * @param memberId
     * @param interactionId
     */
    const sendInteractionId = function (chatId, memberId) {

        var postData = {
            body: `{"interactionId": "${interactionId}", "displayName": "${displayName}", "firstName": "${firstName}", "lastName": "${lastName}" "}`
        };

        $.ajax({
            url:
                `https://api.${environment}/api/v2/webchat/guest/conversations/${chatId}/members/${memberId}/messages`,
            type: "POST",
            data: JSON.stringify(postData),
            contentType: "application/json",
            beforeSend: function(xhr) {
                xhr.setRequestHeader(
                    "Authorization",
                    "bearer " + jwt
                );
            },
            complete: function() {
                if (enableDebugLogging) {
                    console.log('successfully sent interactionId');
                }
            },
            error: function(err) {
                console.error('unable to sent interactionId');
                console.log("error", err);
            }
        });
    };

    /**
     * Sets interactionId variable to interactionId (generated or using preexisting)
     */
    const setInteractionId = function () {
        interactionId = getCookie("interactionId");
        if (interactionId == undefined) {
            interactionId = getGuid();
            setCookie("interactionId", interactionId, 24);
        }
    };
    
    const generateInteractionData = function () {
      interactionId = getGuid();
    }

    /**
     * Callback executed when client is successfully connected to conversation
     */
    const onConnected = function () {
        $("#clickButton").html(clickButtonStopLabel);
        $("#clickButton").attr("disabled", false);
        sendCoBrowseURL(chatId, memberId);
        loadUI(veUrl, tenantId);
    };

    /**
     * Callback executed when message event is received from mypurecloud api
     * @param data received json
     */
    const onReceivedMessageFromConversation = function (data) {
        if (
            data.eventBody &&
            data.eventBody.body &&
            data.eventBody.body.indexOf(veUrl) !== -1
        ) {
            const url = data.eventBody.body;
            $("#response").append(`<p><a href='${url}' target='videoengageriframe' class='blink_me'>Accept Incoming Video Chat</a></p>`);
        }
    };

    let connectedMembersId = [];
    /**
     * Callback executed when socked receives message
     * @param event socket event param
     */
    const onReceivedMessageEventFromSocket = function (event) {
        console.log("onReceivedMessageEventFromSocket started", event);
        const message = JSON.parse(event.data);
        if (message.metadata) {
            switch (message.metadata.type) {
                case 'message': {
                    // onReceivedMessageFromConversation(message);
                    break;
                }
                case 'member-change': {
                    if (message.eventBody && message.eventBody.member.id === memberId && message.eventBody.member.state == 'CONNECTED') {
                        onConnected();
                    } else if (message.eventBody && message.eventBody.member && message.eventBody.member.state == 'CONNECTED') {
                        connectedMembersId.push(message.eventBody.member.id);
                    } else if (message.eventBody && message.eventBody.member && message.eventBody.member.state == 'DISCONNECTED'
                      && connectedMembersId.length >= 2 && connectedMembersId[1] == message.eventBody.member.id) {
                        endVideo(true);
                        connectedMembersId = [];
                    } else if (message.eventBody && message.eventBody.member.id === memberId && message.eventBody.member.state == 'DISCONNECTED') {
                      connectedMembersId = [];
                    }
                    break;
                }
            }
        }
    };

    var canNotStart = () => {
      $("#clickButton").html(clickButtonStartLabel);
      $("#clickButton").attr("disabled", false);
      onError && onError({code: "all_input_fields_are_required"});
    };
    
    /**
     * Executed when clicked on start video button
     * @param interactionId
     */
    const startVideoButtonClickHandler = function () {
        if(!(displayName && firstName && lastName && queueName && organizationId 
          && deploymentId && environment && tenantId)) {
          canNotStart("all_input_fields_are_required");
          return false;
        }
        configureSDK(client, environment, returnExtendedResponses, enableDebugLogging); 
        generateInteractionData();
        afterGenerateInteractionDataCallback && afterGenerateInteractionDataCallback();
        // Create API instance
        const webChatApi = new platformClient.WebChatApi();
        const createChatBody = {
            organizationId: organizationId,
            deploymentId: deploymentId,
            routingTarget: {
                targetType: "QUEUE",
                targetAddress: queueName
            },
            memberInfo: {
                displayName: displayName,
                customFields: {
                    firstName: firstName,
                    lastName: lastName
                }
            }
        };

        // Create chat
        webChatApi
            .postWebchatGuestConversations(createChatBody)
            .then(createChatResponse => {
                let chatInfo = createChatResponse.body ? createChatResponse.body : createChatResponse;

                client.setJwt(chatInfo.jwt);

                let socket = new WebSocket(chatInfo.eventStreamUri);

                chatId = chatInfo.id;
                memberId = chatInfo.member.id;
                jwt = chatInfo.jwt;

                // Listen for messages
                socket.addEventListener("message", onReceivedMessageEventFromSocket);
            })
            .catch(console.error);
        return true;
    };
    
    const deleteConversation = function() {
      if(environment && chatId && memberId) {
        $.ajax({
          url: `https://api.${environment}/api/v2/webchat/guest/conversations/${chatId}/members/${memberId}`,
          type: "DELETE",
          beforeSend: function(xhr) {
                  xhr.setRequestHeader(
                          "Authorization",
                          "bearer " + jwt
                  );
          }
        });
      }
    };
    
    const endVideo = function(isConversationDeleted = false) {
      if(!isConversationDeleted) {
        deleteConversation();
      }
      document.querySelector("#clickButton").innerHTML = clickButtonStartLabel;
      document.querySelector("#clickButton").setAttribute("disabled", false);

      isStarted = false;
    };
    
    let isStarted = false;
    const clickButtonClicked = function() {
      if(isStarted) {
        endVideo();
      } else {
        startButtonPressed && startButtonPressed();
        document.querySelector("#clickButton").setAttribute("disabled", true);
        startVideoButtonClickHandler() ? isStarted = true : isStarted = false; 
      }
    };
    
    var init = function() {
      $("#clickButton").html(clickButtonStartLabel);
    };
        
    (function() {
        document.querySelector("#clickButton").addEventListener("click", clickButtonClicked);
        window.onbeforeunload = () => endVideo();
    })();
    
    return {
      setCoBrowseURL: (inCoBrowseURL) => { coBrowseURL = inCoBrowseURL },
      setDisplayName: (inDisplayName) => { displayName = inDisplayName },
      setFirstName: (inFirstName) => { firstName = inFirstName },
      setLastName: (inLastName) => { lastName = inLastName },
      setOrganizationId: (inOrganizationId) => { organizationId = inOrganizationId },
      setDeploymentId: (inDeploymentId) => { deploymentId = inDeploymentId },
      setVideoengagerUrl: (inVideoengagerUrl) => { veUrl = inVideoengagerUrl },
      setTenantId: (inTenantId) => { tenantId = inTenantId },
      setEnvironment: (inEnvironment) => { environment = inEnvironment },
      setQueue: (inQueue) => { queueName = inQueue },
      init: () => init(),
      setVideoOn: (inVideoOn) => { video_on = inVideoOn },
      setButtonStartLabel: (inStartLabel) => { clickButtonStartLabel = inStartLabel },
      setButtonEndLabel: (inEndLabel) => { clickButtonStopLabel = inEndLabel },
      setVideoIframeHolderName: (inVideoIframeHolderName) => { videoIframeHolderName = inVideoIframeHolderName},
      setCleanUpVideoHolder: (inCleanUpVideoHolder) => { cleanUpVideoHolder = inCleanUpVideoHolder },
      getInteractionId: () => interactionId,
      getDisplayName: () => displayName,
      getFirstName: () => firstName,
      getLastName: () => lastName,
      //callbacks
      afterGenerateInteractionDataCallback: (cb) => { 
        afterGenerateInteractionDataCallback = cb 
      },
      startButtonPressed: (cb) => {
        startButtonPressed = cb
      },
      onError: (cb) => {
        onError = cb;
      }
    };
})();
