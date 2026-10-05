
const money = (n) =>
    "KSh " + Number(n).toLocaleString("en-KE");

let products = [];

let cart = JSON.parse(
    localStorage.getItem("shopnext-cart") || "{}"
);

const $ = (s) => document.querySelector(s);

async function load() {
    const r = await fetch("/api/products");

    if (!r.ok) {
        throw Error("Could not load catalogue");
    }

    products = await r.json();

    renderProducts();
}

function renderProducts() {
    const q = $("#search").value.toLowerCase();

    $("#products").innerHTML =
        products
            .filter((p) =>
                (p.name + " " + p.category)
                    .toLowerCase()
                    .includes(q)
            )
            .map(
                (p) => `
                    <article class="product">
                        <img
                            src="${
                                p.image ||
                                "https://placehold.co/500x350?text=Product"
                            }"
                            alt="${p.name}"
                            onerror="this.src='https://placehold.co/500x350?text=Product'"
                        >

                        <h3>${p.name}</h3>

                        <div class="price">
                            ${money(p.price)}
                        </div>

                        <div class="stock">
                            ● In Stock (${p.stock})
                        </div>

                        <div class="actions">
                            <input
                                type="number"
                                min="1"
                                max="${p.stock}"
                                value="1"
                                id="qty-${p.id}"
                                aria-label="Quantity"
                            >

                            <button
                                class="button"
                                onclick="add(${p.id})"
                            >
                                Add to Cart
                            </button>
                        </div>
                    </article>
                `
            )
            .join("") || "<p>No matching products.</p>";
}

function save() {
    localStorage.setItem(
        "shopnext-cart",
        JSON.stringify(cart)
    );

    renderCart();
}

function add(id) {
    const p = products.find((x) => x.id === id);
    const q = Number($("#qty-" + id).value);

    if (
        !Number.isInteger(q) ||
        q < 1 ||
        q > p.stock
    ) {
        return alert(
            "Select a valid quantity within stock."
        );
    }

    cart[id] = (cart[id] || 0) + q;

    if (cart[id] > p.stock) {
        cart[id] = p.stock;

        alert(
            "Quantity limited to available stock."
        );
    }

    save();
}

function change(id, d) {
    cart[id] = (cart[id] || 0) + d;

    if (cart[id] <= 0) {
        delete cart[id];
    } else {
        cart[id] = Math.min(
            cart[id],
            products.find(
                (p) => p.id === id
            ).stock
        );
    }

    save();
}

function renderCart() {
    const rows = Object.entries(cart).filter(
        ([id, q]) =>
            products.some(
                (p) => p.id === Number(id)
            ) && q > 0
    );

    const qty = rows.reduce(
        (s, [, q]) => s + q,
        0
    );

    const sum = rows.reduce(
        (s, [id, q]) =>
            s +
            products.find(
                (p) => p.id === Number(id)
            ).price *
                q,
        0
    );

    $("#count").textContent = qty;
    $("#cartcount").textContent = qty;

    $("#cartitems").innerHTML =
        rows
            .map(([id, q]) => {
                const p = products.find(
                    (x) => x.id === Number(id)
                );

                return `
                    <div class="cartline">
                        <div>
                            ${p.name}
                            <br>

                            <b>
                                ${money(p.price * q)}
                            </b>

                            <br>

                            <button
                                onclick="change(${id}, -1)"
                            >
                                −
                            </button>

                            ${q}

                            <button
                                onclick="change(${id}, 1)"
                            >
                                +
                            </button>
                        </div>

                        <button
                            onclick="delete cart[${id}]; save()"
                            aria-label="Remove"
                        >
                            ×
                        </button>
                    </div>
                `;
            })
            .join("") ||
        "<p>Your cart is empty.</p>";

    $("#subtotal").textContent = money(sum);
    $("#total").textContent = money(sum);

    $("#checkout").disabled = !qty;
}

$("#search").addEventListener(
    "input",
    renderProducts
);

$("#checkout").onclick = () => {
    $("#paybox").hidden = false;
    $("#phone").focus();
};

$("#pay").onclick = async () => {
    const items = Object.entries(cart).map(
        ([id, quantity]) => ({
            id: Number(id),
            quantity,
        })
    );

    $("#pay").disabled = true;
    $("#notice").textContent =
        "Submitting checkout…";

    try {
        const r = await fetch("/api/checkout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                phone: $("#phone").value,
                items,
            }),
        });

        const d = await r.json();

        if (!r.ok) {
            throw Error(
                d.message || "Checkout failed"
            );
        }

        $("#notice").textContent =
            `${d.message} Order ${d.orderId} · ${money(
                d.amount
            )}`;

        if (d.mode === "live") {
            const id = d.orderId;
            let attempts = 0;

            const poll = setInterval(
                async () => {
                    attempts++;

                    try {
                        const s = await fetch(
                            "/api/orders/" + id
                        ).then((r) =>
                            r.json()
                        );

                        $("#notice").textContent =
                            `Order ${id}: ${s.status}${
                                s.status === "PAID"
                                    ? " — payment confirmed. Thank you!"
                                    : ""
                            }`;

                        if (
                            s.status !== "PENDING" ||
                            attempts >= 36
                        ) {
                            clearInterval(poll);
                        }
                    } catch {}
                },
                5000
            );
        } else {
            $("#notice").textContent +=
                " Demo mode: no phone prompt was sent.";
        }
    } catch (e) {
        $("#notice").textContent =
            e.message;
    } finally {
        $("#pay").disabled = false;
    }
};

load()
    .then(renderCart)
    .catch(
        (e) =>
            ($("#products").textContent =
                e.message)
    );

