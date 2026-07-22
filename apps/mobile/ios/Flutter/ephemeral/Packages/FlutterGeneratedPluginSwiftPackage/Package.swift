// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.
//
// Generated file. Do not edit.
//

import PackageDescription

let package = Package(
    name: "FlutterGeneratedPluginSwiftPackage",
    platforms: [
        .iOS("13.0")
    ],
    products: [
        .library(name: "FlutterGeneratedPluginSwiftPackage", type: .static, targets: ["FlutterGeneratedPluginSwiftPackage"])
    ],
    dependencies: [
        .package(name: "connectivity_plus", path: "../.packages/connectivity_plus-7.2.0"),
        .package(name: "firebase_auth", path: "../.packages/firebase_auth-6.5.4"),
        .package(name: "firebase_core", path: "../.packages/firebase_core-4.11.0"),
        .package(name: "integration_test", path: "../.packages/integration_test"),
        .package(name: "patrol", path: "../.packages/patrol-4.7.1"),
        .package(name: "url_launcher_ios", path: "../.packages/url_launcher_ios-6.4.1"),
        .package(name: "FlutterFramework", path: "../.packages/FlutterFramework")
    ],
    targets: [
        .target(
            name: "FlutterGeneratedPluginSwiftPackage",
            dependencies: [
                .product(name: "connectivity-plus", package: "connectivity_plus"),
                .product(name: "firebase-auth", package: "firebase_auth"),
                .product(name: "firebase-core", package: "firebase_core"),
                .product(name: "integration-test", package: "integration_test"),
                .product(name: "patrol", package: "patrol"),
                .product(name: "url-launcher-ios", package: "url_launcher_ios"),
                .product(name: "FlutterFramework", package: "FlutterFramework")
            ]
        )
    ]
)
