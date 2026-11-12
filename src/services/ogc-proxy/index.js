'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {onRequest}=require('firebase-functions/v2/https');
const {createHandler}=require('./handler');
initializeApp({projectId:'geomine-3'});
exports.geomineOgc=onRequest({region:'southamerica-east1',memory:'1GiB',timeoutSeconds:180,maxInstances:3,concurrency:4,cors:['https://geomine-3.web.app','https://geomine-3.firebaseapp.com']},createHandler({verify:token=>getAuth().verifyIdToken(token)}));
