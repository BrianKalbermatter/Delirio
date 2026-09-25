CC      := gcc
CFLAGS  := -std=c11 -Wall -Wextra -Werror -pedantic -O2 -g
CFLAGS  += -Isrc
SRC     := $(shell find src -name '*.c')
OBJ     := $(patsubst src/%.c,build/%.o,$(SRC))
BIN     := build/delirio-server

TEST_SRC := $(shell find tests -name '*.c')
DOMAIN_SRC := $(shell find src/domain -name '*.c')
TEST_BIN := build/tests

.PHONY: all run test clean

all: $(BIN)

$(BIN): $(OBJ)
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -o $@ $^

build/%.o: src/%.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

run: $(BIN)
	./$(BIN)

test: $(TEST_SRC) $(DOMAIN_SRC)
	@mkdir -p build
	$(CC) $(CFLAGS) -o $(TEST_BIN) $(TEST_SRC) $(DOMAIN_SRC)
	./$(TEST_BIN)

clean:
	rm -rf build
