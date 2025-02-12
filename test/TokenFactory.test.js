import { expect, use } from 'chai';
import pkg from 'hardhat';
const { ethers } = pkg;
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe('Token Creator Contract', function () {
    let tokenFactory, native;
    let owner, user;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();

        const Native = await ethers.getContractFactory('Native');
        native = await Native.deploy();
        await native.deployed();

        const TokenFactory = await ethers.getContractFactory('TokenFactory');
        const fee = ethers.utils.parseUnits('10', 18);
        tokenFactory = await TokenFactory.deploy(native.address, fee);
        await tokenFactory.deployed();
    });

    describe('Create Token', function () {
        it('Should create a new token with specified name, symbol, and supply after paying fee', async function () {
            const name = 'Test Token';
            const symbol = 'TST';
            const totalSupply = ethers.utils.parseUnits('1000', 0);

            const tx = await tokenFactory.createToken(name, symbol, totalSupply, {
                value: ethers.utils.parseUnits('10', 18),
            });
            const receipt = await tx.wait();

            const event = receipt.events.find((e) => e.event === 'TokenCreated');
            const [tokenAddress, , , adjustedTotalSupply] = event.args;

            expect(ethers.utils.isAddress(tokenAddress)).to.be.true;

            const ERC20Token = await ethers.getContractFactory('ERC20Token');
            const newToken = ERC20Token.attach(tokenAddress);
            const actualSupply = await newToken.totalSupply();

            expect(actualSupply.toString()).to.equal(adjustedTotalSupply.toString());
        });

        it('Should reject token creation if fee is not paid', async function () {
            const name = 'No Fee Token';
            const symbol = 'NFT';
            const totalSupply = ethers.utils.parseUnits('1000', 0);

            await expect(
                tokenFactory.createToken(name, symbol, totalSupply, {
                    value: ethers.utils.parseUnits('0', 18),
                }),
            ).to.be.rejectedWith('Insufficient fee');
        });

        it('Should reject if total supply is zero', async function () {
            const name = 'Invalid Token';
            const symbol = 'INV';
            const totalSupply = ethers.utils.parseUnits('0', 0);

            await expect(
                tokenFactory.createToken(name, symbol, totalSupply, {
                    value: ethers.utils.parseUnits('10', 18),
                }),
            ).to.be.rejectedWith('Total supply must be greater than zero');
        });
    });

    describe('Fee Management', function () {
        it('Should store the fee in the contract after token creation', async function () {
            const fee = ethers.utils.parseUnits('10', 18);
            const name = 'Test Token';
            const symbol = 'TST';
            const totalSupply = ethers.utils.parseUnits('1000', 0);

            let contractBalance = await ethers.provider.getBalance(tokenFactory.address);
            expect(contractBalance.toString()).to.equal('0');

            await tokenFactory.connect(owner).createToken(name, symbol, totalSupply, {
                value: fee,
            });

            contractBalance = await ethers.provider.getBalance(tokenFactory.address);
            expect(contractBalance.toString()).to.equal(fee.toString());
        });

        it('Should reject fee withdrawal by non-owner', async function () {
            await expect(tokenFactory.connect(user).withdrawFees()).to.be.rejectedWith(
                'Only the owner can perform this action',
            );
        });

        it('Should allow owner to update the fee', async function () {
            const newFee = ethers.utils.parseUnits('15', 18);
            await tokenFactory.connect(owner).updateFee(newFee);

            const updatedFee = await tokenFactory.fee();
            expect(updatedFee.toString()).to.equal(newFee.toString());
        });

        it('Should reject fee updates by non-owner', async function () {
            const newFee = ethers.utils.parseUnits('15', 18);

            await expect(tokenFactory.connect(user).updateFee(newFee)).to.be.rejectedWith(
                'Only the owner can perform this action',
            );
        });
    });
});
