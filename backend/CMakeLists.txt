cmake_minimum_required(VERSION 3.20)
project(CoreMatchExchange VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# vcpkg toolchain is passed via -DCMAKE_TOOLCHAIN_FILE
find_package(unofficial-crow CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(mongocxx CONFIG REQUIRED)
find_package(bsoncxx CONFIG REQUIRED)
find_package(jwt-cpp CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(Boost REQUIRED COMPONENTS asio)

set(SOURCES
    src/main.cpp
    src/engine/order_book.cpp
    src/engine/matching_engine.cpp
    src/risk/risk_engine.cpp
    src/portfolio/portfolio_engine.cpp
    src/market/market_stats.cpp
    src/market/market_simulator.cpp
    src/auth/auth_manager.cpp
    src/db/mongo_client.cpp
    src/ws/ws_broadcaster.cpp
)

add_executable(exchange_server ${SOURCES})

target_include_directories(exchange_server PRIVATE src)

target_link_libraries(exchange_server PRIVATE
    unofficial::crow::crow
    nlohmann_json::nlohmann_json
    $<IF:$<TARGET_EXISTS:mongo::mongocxx_shared>,mongo::mongocxx_shared,mongo::mongocxx_static>
    $<IF:$<TARGET_EXISTS:mongo::bsoncxx_shared>,mongo::bsoncxx_shared,mongo::bsoncxx_static>
    jwt-cpp::jwt-cpp
    OpenSSL::SSL
    OpenSSL::Crypto
    Boost::asio
)

# Windows-specific settings
if(WIN32)
    target_compile_definitions(exchange_server PRIVATE
        WIN32_LEAN_AND_MEAN
        NOMINMAX
        _WIN32_WINNT=0x0601
    )
    target_link_libraries(exchange_server PRIVATE ws2_32 mswsock)
endif()

# Release optimizations
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    target_compile_options(exchange_server PRIVATE
        $<$<CXX_COMPILER_ID:MSVC>:/O2 /GL /arch:AVX2>
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-O3 -march=native>
    )
    target_link_options(exchange_server PRIVATE
        $<$<CXX_COMPILER_ID:MSVC>:/LTCG>
    )
endif()

# ── Tests ────────────────────────────────────────────────────────────────────
find_package(GTest CONFIG QUIET)
if(GTest_FOUND)
    enable_testing()
    add_executable(exchange_tests
        tests/test_matching_engine.cpp
        tests/test_order_book.cpp
        tests/test_risk_engine.cpp
        src/engine/order_book.cpp
        src/engine/matching_engine.cpp
        src/risk/risk_engine.cpp
        src/portfolio/portfolio_engine.cpp
        src/market/market_stats.cpp
        src/market/market_simulator.cpp
    )
    target_include_directories(exchange_tests PRIVATE src)
    target_link_libraries(exchange_tests PRIVATE
        GTest::gtest_main
        nlohmann_json::nlohmann_json
    )
    add_test(NAME ExchangeTests COMMAND exchange_tests)
endif()
